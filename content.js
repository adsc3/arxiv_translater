// content.js

if (typeof window.arxivTranslatorInjected === 'undefined') {
    window.arxivTranslatorInjected = true;

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "start_translation") {
            startTranslation();
            sendResponse({ status: "started" });
        }
        return true;
    });

    function showStatus(text) {
        let statusEl = document.getElementById('arxiv-translator-status');
        if (!statusEl) {
            statusEl = document.createElement('div');
            statusEl.id = 'arxiv-translator-status';
            Object.assign(statusEl.style, {
                position: 'fixed', bottom: '20px', right: '20px',
                background: '#3b82f6', color: 'white', padding: '12px 20px',
                borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                fontFamily: 'sans-serif', zIndex: '999999', fontSize: '14px',
                transition: 'opacity 0.3s'
            });
            document.body.appendChild(statusEl);
        }
        statusEl.textContent = text;
        statusEl.style.opacity = '1';
    }

    function hideStatus(delay = 3000) {
        const statusEl = document.getElementById('arxiv-translator-status');
        if (statusEl) {
            setTimeout(() => {
                statusEl.style.opacity = '0';
                setTimeout(() => statusEl.remove(), 300);
            }, delay);
        }
    }

    function injectTooltipCSS() {
        if (document.getElementById('arxiv-translator-tooltip-style')) return;
        const style = document.createElement('style');
        style.id = 'arxiv-translator-tooltip-style';
        style.textContent = `
            .arxiv-translated-text {
                cursor: help;
                transition: background-color 0.2s;
                position: relative;
            }
            .arxiv-translated-text:hover {
                background-color: rgba(59, 130, 246, 0.1);
            }
            #arxiv-translator-tooltip {
                position: absolute;
                background: #1e293b;
                color: #f8fafc;
                padding: 12px 16px;
                border-radius: 8px;
                box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -4px rgba(0, 0, 0, 0.1);
                font-family: 'Segoe UI', system-ui, sans-serif;
                font-size: 14px;
                line-height: 1.6;
                max-width: 500px;
                z-index: 1000000;
                pointer-events: none;
                opacity: 0;
                visibility: hidden;
                transition: opacity 0.2s ease-in-out, visibility 0.2s ease-in-out;
                border: 1px solid #334155;
            }
            #arxiv-translator-tooltip .ltx_Math {
                color: #cbd5e1;
                font-family: inherit;
            }
        `;
        document.head.appendChild(style);
    }

    let tooltipElement = null;

    function getOrCreateTooltip() {
        if (!tooltipElement) {
            tooltipElement = document.getElementById('arxiv-translator-tooltip');
            if (!tooltipElement) {
                tooltipElement = document.createElement('div');
                tooltipElement.id = 'arxiv-translator-tooltip';
                document.body.appendChild(tooltipElement);
            }
        }
        return tooltipElement;
    }

    function handleMouseEnter(e) {
        const tooltip = getOrCreateTooltip();
        const originalHtml = e.currentTarget.getAttribute('data-original-html');
        if (originalHtml) {
            tooltip.innerHTML = originalHtml;
            positionTooltip(e, tooltip);
            tooltip.style.opacity = '1';
            tooltip.style.visibility = 'visible';
        }
    }

    function handleMouseLeave(e) {
        const tooltip = getOrCreateTooltip();
        tooltip.style.opacity = '0';
        tooltip.style.visibility = 'hidden';
    }

    function handleMouseMove(e) {
        const tooltip = getOrCreateTooltip();
        if (tooltip.style.opacity === '1') {
            positionTooltip(e, tooltip);
        }
    }

    function positionTooltip(e, tooltip) {
        const offsetX = 15;
        const offsetY = 20;

        let x = e.pageX + offsetX;
        let y = e.pageY + offsetY;

        // Temporarily display block to get current dimensions if it's hidden but about to show
        const previousVisibility = tooltip.style.visibility;
        tooltip.style.visibility = 'hidden';
        tooltip.style.display = 'block';

        const tooltipRect = tooltip.getBoundingClientRect();

        // Restore
        tooltip.style.display = '';
        tooltip.style.visibility = previousVisibility;

        const padding = 15;

        if (e.clientX + offsetX + tooltipRect.width > window.innerWidth - padding) {
            x = e.pageX - tooltipRect.width - offsetX;
        }

        // Instead of bottom bounding alone, let's keep it simpler or just avoid overlapping the mouse
        if (e.clientY + offsetY + tooltipRect.height > window.innerHeight - padding) {
            // Put it above the cursor if it runs out of vertical space
            y = e.pageY - tooltipRect.height - 10;
        }

        tooltip.style.left = `${x}px`;
        tooltip.style.top = `${y}px`;
    }

    async function startTranslation() {
        showStatus("翻訳準備中...");

        // 1. Find translatable elements
        const selectors = 'p, h1, h2, h3, h4, h5, h6, figcaption, li, div.abstract';
        let elements = Array.from(document.querySelectorAll(selectors));

        // 2. Filter elements
        elements = elements.filter(el => {
            // Must have visible text
            if (!el.innerText.trim()) return false;
            // Skip navigation, header, footer, references (optional, but let's translate references too if they are just items)
            if (el.closest('nav, header, footer, .ltx_navigation')) return false;
            // Exclude raw math wrappers if they are isolated
            if (el.classList.contains('ltx_equation') || el.classList.contains('ltx_Math')) return false;
            return true;
        });

        // Remove elements that are descendants of other matched elements to prevent double-translation
        elements = elements.filter(el => {
            let parent = el.parentElement;
            while (parent) {
                if (elements.includes(parent)) return false;
                parent = parent.parentElement;
            }
            return true;
        });

        if (elements.length === 0) {
            showStatus("翻訳対象のテキストが見つかりませんでした。");
            hideStatus();
            return;
        }

        // 3. Process in dynamic batches based on character length
        const MAX_CHARS_PER_BATCH = 2500; // Safe limit to prevent exceeding API token/output bounds
        let batches = [];
        let currentBatch = [];
        let currentCharCount = 0;

        for (const el of elements) {
            const html = el.innerHTML;
            // If a single element is larger than the batch size, it has to go in its own batch
            if (currentBatch.length > 0 && currentCharCount + html.length > MAX_CHARS_PER_BATCH) {
                batches.push(currentBatch);
                currentBatch = [];
                currentCharCount = 0;
            }
            currentBatch.push(el);
            currentCharCount += html.length;
        }
        if (currentBatch.length > 0) {
            batches.push(currentBatch);
        }

        let completed = 0;

        showStatus(`翻訳中... 0 / ${batches.length} ブロック`);

        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i];
            const texts = batch.map(el => el.innerHTML); // Keep HTML structure

            try {
                console.log(`Sending batch ${i + 1}/${batches.length} with ${texts.length} items to background script...`);
                const response = await chrome.runtime.sendMessage({
                    action: "translate_chunk",
                    texts: texts
                });
                console.log(`Received response for batch ${i + 1}: `, response);

                if (response && response.success) {
                    const translatedTexts = response.translatedTexts;
                    // Inject tooltip CSS if it hasn't been added yet
                    injectTooltipCSS();

                    // Replace HTML carefully
                    batch.forEach((el, index) => {
                        if (translatedTexts[index]) {
                            // Save original text
                            el.setAttribute('data-original-html', el.innerHTML);
                            // Replace with translated text
                            el.innerHTML = translatedTexts[index];

                            // Add classes and events
                            el.classList.add('arxiv-translated-text');
                            el.addEventListener('mouseenter', handleMouseEnter);
                            el.addEventListener('mouseleave', handleMouseLeave);
                            el.addEventListener('mousemove', handleMouseMove);
                        }
                    });
                } else {
                    console.error("Translation failed for a batch:", response?.error);
                    showStatus(`エラー: ${response?.error} `);
                    return;
                }

                completed += batch.length;
                showStatus(`翻訳中... ${Math.min(completed, elements.length)} / ${elements.length} ブロック`);

                // Small delay between batches to be nice to API limits
                await new Promise(r => setTimeout(r, 1000));

            } catch (err) {
                console.error("Translation request error:", err);
                showStatus(`エラーが発生しました: ${err.message || '通信失敗'}`);
                return;
            }
        }

        showStatus("翻訳が完了しました！");
        hideStatus(3000);
    }
}
