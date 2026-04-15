# Obsidian Community Plugins - New Plugin Submission

## Plugin Information

**Plugin ID:** `llm-wiki`
**Plugin Name:** LLM Wiki
**Repository:** https://github.com/Jindequan/obsidian-llm-wiki

## Description

Turn URLs, PDFs, and files into structured wiki pages with AI.

This sentence should match `manifest.json` exactly, including the trailing punctuation.

## Features

- Ingest web pages and local files from one workflow
- Save a raw source document for every import
- Generate source, entity, and concept pages with backlinks
- Update `index.md` and `log.md` automatically
- Show generated artifacts so you can open results immediately
- Support Anthropic, OpenAI, Z.AI, DeepSeek, and Ali Qwen
- Wiki health check for orphan pages and broken references
- Privacy warning before sending content to AI providers

## Usage

1. Install the plugin
2. Configure your AI provider and API key in settings
3. Use the sidebar to paste URLs or drag-drop files
4. The plugin generates structured wiki pages automatically

## API Key Required

Yes - users need their own API key for one of the supported AI providers.

## Screenshots

The plugin includes a custom sidebar UI with:
- Input field for URLs and file paths
- Live activity log showing processing steps
- Generated artifacts with direct file links
- Drag-and-drop file support

## License

MIT

## Notes

- Plugin requires users to bring their own API key
- Privacy warning is shown before content is sent to AI providers
- Users can customize the wiki output path
- Supports multiple AI providers for flexibility
