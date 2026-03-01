// background.js

const DEFAULT_PROMPT = `あなたはプロの科学技術翻訳者です。
与えられた英語の学術論文の一部を、文脈を考慮して自然で正確な日本語に翻訳してください。
HTMLのタグ（<a>、<span>、<em>、<strong>など）がテキスト内に含まれる場合がありますが、翻訳結果にもその構造をそのまま維持して出力してください。
MathJaxの数式等（例: class="ltx_Math" を持つspan）は絶対に翻訳せず、元のまま保持してください。
出力は翻訳結果のHTML文字列を含む配列のみとし、余計な説明は絶対に省いてください。`;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "translate_chunk") {
        handleTranslation(request.texts)
            .then(translatedTexts => sendResponse({ success: true, translatedTexts }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true; // Indicates asynchronous response
    }
});

async function handleTranslation(texts) {
    // 1. Retrieve settings
    const settings = await chrome.storage.local.get({
        apiKey: '',
        prompt: DEFAULT_PROMPT,
        model: 'gemini-1.5-flash'
    });

    if (!settings.apiKey) {
        throw new Error('API Key is missing. Please set it in the extension options.');
    }

    const systemInstruction = settings.prompt || DEFAULT_PROMPT;
    const model = settings.model || 'gemini-1.5-flash';

    // 2. Prepare payload
    const promptText = `${systemInstruction}\n\n以下のJSON配列形式の英語HTMLテキスト要素を翻訳し、元の配列と同じ要素数のJSON配列として出力してください。各要素は元のHTML構造を可能な限り保ち、意味が通るように日本語にしてください。\n\n\`\`\`json\n${JSON.stringify(texts, null, 2)}\n\`\`\``;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${settings.apiKey}`;

    const payload = {
        contents: [{
            role: "user",
            parts: [{ text: promptText }]
        }],
        generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
            responseSchema: {
                type: "ARRAY",
                items: {
                    type: "STRING"
                }
            }
        }
    };

    // 3. API Call
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `API error: ${response.status}`);
    }

    const data = await response.json();
    let resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!resultText) {
        throw new Error('No translation returned from API.');
    }

    // Strip markdown code block wrappers if they exist
    resultText = resultText.replace(/^```(json)?/i, '').replace(/```$/i, '').trim();

    // 4. Parse result
    try {
        const translatedArray = JSON.parse(resultText);
        if (!Array.isArray(translatedArray)) {
            throw new Error('Result is not a JSON array.');
        }
        if (translatedArray.length !== texts.length) {
            console.warn(`Length mismatch: Sent ${texts.length}, Received ${translatedArray.length}`);
            // While dangerous, attempting to return it might prevent complete failure if slightly off.
            // It's better to just return what we have or error out. 
            if (translatedArray.length < texts.length) {
                // Pad with original texts if missing
                while (translatedArray.length < texts.length) {
                    translatedArray.push(texts[translatedArray.length]);
                }
            }
        }
        return translatedArray.slice(0, texts.length);
    } catch (e) {
        console.error("Failed to parse JSON from Gemini:", resultText);
        throw new Error('Invalid JSON format returned from translation API.');
    }
}
