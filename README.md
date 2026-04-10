# LLM Wiki for Obsidian

Turn URLs, PDFs, and files into structured wiki pages with AI.

LLM Wiki saves the raw source, extracts entities and concepts with your preferred AI provider, writes linked notes, and keeps an index of generated pages so your vault stays traceable instead of becoming a pile of one-off summaries.

## What It Does

- Ingest web pages and local files from one workflow
- Save a raw source document for every import
- Generate source, entity, and concept pages with backlinks
- Update `index.md` and `log.md` automatically
- Show generated artifacts so you can open results immediately
- Support Anthropic, OpenAI, Z.AI, DeepSeek, and Ali Qwen

## Best For

- Research notes built from articles, reports, and PDFs
- Personal knowledge bases that need consistent structure
- Obsidian users who want AI-assisted extraction without losing the original source
- Teams or individuals who prefer bringing their own API key and model

## How It Organizes Your Vault

The plugin writes content into a predictable structure. By default, it creates:

```text
wiki/
├── sources/
├── entities/
├── concepts/
├── synthesis/
├── index.md
└── log.md

wiki/../raw/
└── YYYY-MM-DD-source-slug.md
```

You can customize the output path in plugin settings (e.g., `02-Works/wiki/` for organized vaults).

Each generated page follows a consistent wiki schema with metadata, summary, key points, connections, and references back to the raw source.

## Installation

### Manual Install

1. Download the latest release assets or build the plugin from source.
2. Create this folder inside your vault:

```text
<vault>/.obsidian/plugins/llm-wiki/
```

3. Copy these files into that folder:
   - `main.js`
   - `manifest.json`
   - `versions.json`
4. Restart Obsidian or reload community plugins.
5. Enable `LLM Wiki` in `Settings -> Community Plugins`.

### Build From Source

```bash
npm install
npm run build
```

The compiled plugin bundle is written to `.build/main.js`.

If you want release-ready assets locally, run:

```bash
npm run package:release
```

This creates `.release/<version>/` with `main.js`, `manifest.json`, `versions.json`, and a zip archive.

## Quick Start

1. Open `Settings -> LLM Wiki`
2. Choose your AI provider
3. Paste your API key
4. Optionally change the model and output path
5. Open the `LLM Wiki` sidebar
6. Paste a URL or local file path, or drag a file into the sidebar
7. Click `Process`

## Supported Inputs

- Web pages over `http` and `https`
- PDF files
- Markdown files
- Text files

## Commands

- `Open LLM Wiki sidebar`
- `Process URL to Wiki`
- `Process File to Wiki`
- `Wiki health check`

## AI Providers

| Provider | Typical models | Notes |
|----------|----------------|-------|
| Anthropic | `claude-3-5-sonnet-20241022` | Strong long-form structured output |
| OpenAI | `gpt-4-turbo-preview` | Fast general-purpose generation |
| Z.AI | `glm-4-plus` | Good bilingual support |
| DeepSeek | `deepseek-chat` | Strong technical and code-heavy content |
| Ali Qwen | `qwen-max` | Long context and document workflows |

You need your own API key for the provider you choose.

## Output Example

Generated notes are designed to stay readable and linkable:

```markdown
---
type: entity|concept|source|synthesis
created: 2026-04-10
modified: 2026-04-10
sources:
  - [[raw/2026-04-10-source-slug]]
tags: [entity]
---

# Page Title

## Summary
One-sentence summary.

## Key Points
- Point 1
- Point 2

## Connections
- [[Related Page]]

## References
- Source: [[raw/2026-04-10-source-slug]]
```

## Privacy And Data

- This plugin sends extracted content to the AI provider you configure
- Your data handling depends on the provider and account you choose
- Review your provider's terms, retention policy, and API settings before using sensitive content

## Limitations

- Some websites block automated requests or hide content behind dynamic rendering
- OCR for scanned PDFs is not included
- Output quality depends on the source material, prompt schema, and model you use

## Troubleshooting

### No API Key

- Open `Settings -> LLM Wiki`
- Add the API key for the selected provider

### File Processing Fails

- Use an absolute path or a path relative to the vault root
- Make sure the file format is supported
- For files outside the vault, use the full system path

### URL Processing Fails

- Some sites block automated requests
- Try a reader view or a local copy of the content
- Dynamic pages may require manual capture

## For Maintainers

Release automation and marketplace submission notes are documented in [docs/releasing.md](docs/releasing.md).

## Roadmap

- Batch ingestion
- Query and synthesis workflows
- Wiki lint and consistency review
- Custom schema editing
- Graph and relationship visualization

## Credits

Inspired by the [LLM Wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) by Andrej Karpathy.

## License

MIT
