// popup.js

document.getElementById('optionsLink').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
});

document.getElementById('translateBtn').addEventListener('click', async () => {
    const btn = document.getElementById('translateBtn');
    const errorMsg = document.getElementById('error-msg');

    errorMsg.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Starting...';

    try {
        // Get the active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tab) {
            throw new Error('No active tab found.');
        }

        if (!tab.url.includes('arxiv.org/html/')) {
            throw new Error('This extension only works on arxiv.org/html/ pages.');
        }

        // Inject the content script if it hasn't been injected yet
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
        });

        // Send translation message
        chrome.tabs.sendMessage(tab.id, { action: "start_translation" }, (response) => {
            if (chrome.runtime.lastError) {
                errorMsg.textContent = 'Error communicating with page: ' + chrome.runtime.lastError.message;
                errorMsg.style.display = 'block';
                btn.disabled = false;
                btn.textContent = 'Translate Page';
            } else {
                // Translation started successfully
                btn.textContent = 'Translating...';
                // Close popup after a short delay
                setTimeout(() => window.close(), 1000);
            }
        });

    } catch (err) {
        errorMsg.textContent = err.message;
        errorMsg.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Translate Page';
    }
});
