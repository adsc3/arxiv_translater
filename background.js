// background.js

const DEFAULT_PROMPT = `あなたはプロの科学技術翻訳者です。
与えられた英語の学術論文の一部を、文脈を考慮して自然で正確な日本語に翻訳してください。
HTMLのタグ（<a>、<span>、<em>、<strong>など）がテキスト内に含まれる場合がありますが、翻訳結果にもその構造をそのまま維持して出力してください。
MathJaxの数式等（例: class="ltx_Math" を持つspan）は絶対に翻訳せず、元のまま保持してください。
出力は翻訳結果のHTML文字列を含むJSON配列のみとし、前置きや解説、マークダウン記法（\`\`\`jsonなど）は一切含めないでください。純粋なJSON配列の文字列だけを出力すること。`;

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
            maxOutputTokens: 8192,
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

    // Extract JSON array from the response in case the model adds markdown or conversational text.
    // Allow for the closing bracket to be missing if the response was truncated.
    const match = resultText.match(/\[[\s\S]*/);
    if (match) {
        resultText = match[0];
        // If it was truncated, it won't have a closing square bracket at the very end
        if (!resultText.trim().endsWith(']')) {
            console.warn("Detected missing array closing bracket, response is likely truncated.");
        }
    } else {
        resultText = resultText.trim();
    }

    // 4. Parse result
    let translatedArray = null;
    try {
        // Try strict parse first
        // If the array was truncated, we can attempt a quick fix by appending ']'
        let textToParse = resultText;
        if (!textToParse.trim().endsWith(']')) {
            textToParse += '"]'; // Try to close the last string and the array
        }
        translatedArray = JSON.parse(textToParse);
    } catch (e) {
        console.warn("JSON parse failed, attempting fallback regex parsing for truncated JSON:", e.message);

        // Fallback: Model output was likely truncated due to length limits. 
        // We can extract all successfully generated JSON strings using regex.
        try {
            // Regex to match valid JSON format strings
            const stringRegex = /"(?:\\\\|\\"|[^"\\])*"/g;
            const matches = resultText.match(stringRegex);
            if (matches) {
                translatedArray = matches.map(s => {
                    try { return JSON.parse(s); } catch { return null; }
                }).filter(s => s !== null);
            }
        } catch (fallbackErr) {
            console.error("Fallback parsing failed:", fallbackErr);
        }

        if (!translatedArray || translatedArray.length === 0) {
            console.error("Failed to parse any JSON strings from Gemini:", resultText);
            throw new Error('Invalid JSON format returned from translation API.');
        }
    }

    if (!Array.isArray(translatedArray)) {
        throw new Error('Result is not a JSON array.');
    }

    if (translatedArray.length !== texts.length) {
        console.warn(`Length mismatch: Sent ${texts.length}, Received ${translatedArray.length}`);
        // Instead of padding with the original English text (which masks the failure),
        // we'll just return what was successfully translated. content.js replaces
        // elements based on the index position, so the ones at the end will just
        // not be translated (as expected for a truncation).
    }

    return translatedArray.slice(0, texts.length);
}
