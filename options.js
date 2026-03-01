// options.js

// Restore settings when the page is loaded
document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.local.get(
        {
            apiKey: '',
            prompt: typeof DEFAULT_PROMPT !== 'undefined' ? DEFAULT_PROMPT : '',
            model: 'gemini-1.5-flash',
            availableModels: []
        },
        (items) => {
            document.getElementById('apiKey').value = items.apiKey;
            document.getElementById('prompt').value = items.prompt;

            const modelSelect = document.getElementById('model');
            if (items.availableModels && items.availableModels.length > 0) {
                populateModels(items.availableModels, items.model);
            } else {
                modelSelect.value = items.model;
            }
        }
    );
});

function populateModels(models, selectedModel) {
    const select = document.getElementById('model');
    select.innerHTML = '';
    models.forEach(m => {
        const opt = document.createElement('option');
        // The API returns name like "models/gemini-1.5-flash"
        const modelId = m.name ? m.name.replace('models/', '') : m;
        opt.value = modelId;
        opt.textContent = modelId;
        select.appendChild(opt);
    });

    // Keep the current selection if available
    if (Array.from(select.options).some(opt => opt.value === selectedModel)) {
        select.value = selectedModel;
    } else {
        // If selected model is not in the list, still add it manually to prevent data loss
        const opt = document.createElement('option');
        opt.value = selectedModel;
        opt.textContent = selectedModel;
        select.appendChild(opt);
        select.value = selectedModel;
    }
}

// Fetch available models from Gemini API
document.getElementById('fetchModelsBtn').addEventListener('click', async () => {
    const apiKey = document.getElementById('apiKey').value.trim();
    const msgEl = document.getElementById('modelMsg');

    if (!apiKey) {
        msgEl.textContent = 'Please enter your API Key above first.';
        msgEl.style.color = '#ef4444';
        msgEl.style.display = 'block';
        return;
    }

    msgEl.textContent = 'Fetching models list...';
    msgEl.style.color = '#3b82f6';
    msgEl.style.display = 'block';

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || `API returned ${response.status}`);
        }
        const data = await response.json();

        // Filter out models that support text generation (generateContent)
        const supportedModels = (data.models || []).filter(m =>
            m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent')
        );

        if (supportedModels.length === 0) {
            throw new Error('No compatible models found for this API Key.');
        }

        const currentModel = document.getElementById('model').value;
        populateModels(supportedModels, currentModel);

        // Save to local storage cache
        chrome.storage.local.set({ availableModels: supportedModels });

        msgEl.textContent = `Successfully loaded ${supportedModels.length} models.`;
        msgEl.style.color = '#10b981';

        setTimeout(() => { msgEl.style.display = 'none'; }, 3000);
    } catch (err) {
        msgEl.textContent = `Error: ${err.message}`;
        msgEl.style.color = '#ef4444';
    }
});

// Save settings
document.getElementById('save').addEventListener('click', () => {
    const apiKey = document.getElementById('apiKey').value.trim();
    const prompt = document.getElementById('prompt').value;
    const model = document.getElementById('model').value;

    chrome.storage.local.set(
        {
            apiKey: apiKey,
            prompt: prompt,
            model: model
        },
        () => {
            // Update status to let user know options were saved.
            const status = document.getElementById('status');
            status.style.opacity = 1;
            setTimeout(() => {
                status.style.opacity = 0;
            }, 2000);
        }
    );
});
