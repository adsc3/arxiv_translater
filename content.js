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

        // 3. Process in batches
        const BATCH_SIZE = 15;
        let completed = 0;

        showStatus(`翻訳中... 0 / ${elements.length} ブロック`);

        for (let i = 0; i < elements.length; i += BATCH_SIZE) {
            const batch = elements.slice(i, i + BATCH_SIZE);
            const texts = batch.map(el => el.innerHTML); // Keep HTML structure

            try {
                console.log(`Sending batch ${i / BATCH_SIZE + 1} with ${texts.length} items to background script...`);
                const response = await chrome.runtime.sendMessage({
                    action: "translate_chunk",
                    texts: texts
                });
                console.log(`Received response for batch ${i / BATCH_SIZE + 1}:`, response);

                if (response && response.success) {
                    const translatedTexts = response.translatedTexts;
                    // Replace HTML carefully
                    batch.forEach((el, index) => {
                        if (translatedTexts[index]) {
                            el.innerHTML = translatedTexts[index];
                        }
                    });
                } else {
                    console.error("Translation failed for a batch:", response?.error);
                    showStatus(`エラー: ${response?.error}`);
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
