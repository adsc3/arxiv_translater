# ArXiv Translation to Japanese

A Chrome extension that translates [arXiv](https://arxiv.org/) HTML papers into Japanese using the Gemini API. This extension extracts the text from arXiv HTML papers and translates it in-place using Google's generative AI models.

## Features

- **In-place Translation**: Translates the content of arXiv HTML papers (`https://arxiv.org/html/*`) directly on the page.
- **Customizable Prompt**: You can customize the prompt sent to the LLM to adjust the translation style or instructions.
- **Model Selection**: Choose which Gemini model to use (e.g., `gemini-1.5-flash`, `gemini-1.5-pro`). Fetches available models dynamically using your API key.
- **Privacy First**: Your Gemini API key is stored locally in your browser storage and is never sent anywhere other than the official Google API endpoint.

## Installation

Since this extension is not currently published on the Chrome Web Store, you can install it manually:

1. Clone or download this repository to your local machine.
2. Open Google Chrome and go to the Extensions page (`chrome://extensions/`).
3. Enable **Developer mode** by toggling the switch in the top right corner.
4. Click on the **Load unpacked** button.
5. Select the directory where you cloned or extracted this repository (`chrome_extension_arxiv_translate`).

## Configuration

Before using the extension, you need to configure your Gemini API Key:

1. Click on the extension icon in your toolbar and click **⚙️ Settings**, or right-click the extension icon and select **Options**.
2. Enter your **Gemini API Key**. You can get one from Google AI Studio.
3. (Optional) Customize the **Translation Prompt**.
4. Click the **Fetch** button to load available models and select your preferred **Gemini Model**.
5. Click **Save Settings**.

## Usage

1. Navigate to an arXiv paper in HTML format (e.g., URLs starting with `https://arxiv.org/html/`).
2. Click the extension icon in the Chrome toolbar.
3. Click the **Translate Page** button.
4. Wait for the translation to complete. The text on the page will be replaced with the Japanese translation.

## Permissions Required

- `storage`: To save your API key, prompt, and model settings locally.
- `scripting`: To execute the translation script on the arXiv page.
- `activeTab`: To access the currently active arXiv tab.
- `host_permissions` (`https://arxiv.org/html/*`, `https://generativelanguage.googleapis.com/*`): Required to read the paper and communicate with the Gemini API.
