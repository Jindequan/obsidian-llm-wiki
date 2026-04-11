import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import LLMWikiPlugin from './main';
import { ProviderType } from './providers';

export class LLMWikiSettingTab extends PluginSettingTab {
	plugin: LLMWikiPlugin;

	constructor(app: App, plugin: LLMWikiPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();
		containerEl.createEl('h2', { text: 'LLM Wiki Settings' });

		// Add browser extension setup notice
		const browserExtNotice = containerEl.createDiv();
		browserExtNotice.className = 'setting-item';
		browserExtNotice.innerHTML = `
			<div style="padding: 12px; background: var(--background-secondary); border-radius: 6px; border-left: 3px solid var(--interactive-accent);">
				<h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600;">🌐 Browser Extension</h3>
				<p style="margin: 0 0 8px 0; font-size: 13px; color: var(--text-muted);">
					This plugin has a built-in HTTP server for browser extension integration.
				</p>
				<p style="margin: 0 0 8px 0; font-size: 13px; color: var(--text-muted);">
					Server running at: <strong>http://localhost:${this.plugin.settings.httpServerPort}</strong>
				</p>
				<p style="margin: 0; font-size: 13px; color: var(--text-muted);">
					Install the Chrome extension to send URLs from your browser directly to Obsidian!
				</p>
			</div>
		`;

		new Setting(containerEl)
			.setName('AI Provider')
			.setDesc('Choose the AI provider for generating wiki content')
			.addDropdown((dropdown) => dropdown
				.addOption('anthropic', 'Anthropic Claude')
				.addOption('openai', 'OpenAI GPT')
				.addOption('zai', 'Z.AI')
				.addOption('deepseek', 'DeepSeek')
				.addOption('aliqwen', 'Ali Qwen')
				.addOption('custom', 'Custom (OpenAI-compatible)')
				.setValue(this.plugin.settings.aiProvider)
				.onChange(async (value: ProviderType) => {
					this.plugin.settings.aiProvider = value;
					// Update default model based on provider
					const defaultModels: Record<ProviderType, string> = {
						anthropic: 'claude-3-5-sonnet-20241022',
						openai: 'gpt-4-turbo-preview',
						zai: 'glm-4-plus',
						deepseek: 'deepseek-chat',
						aliqwen: 'qwen-max',
						custom: 'gpt-4-turbo-preview',
					};
					this.plugin.settings.model = defaultModels[value] || 'gpt-4-turbo-preview';
					await this.plugin.saveSettings();
					this.display(); // Refresh to show/hide custom URL field
				}));

		new Setting(containerEl)
			.setName('API Key')
			.setDesc('Your API key for the selected provider')
			.addText((text) => {
				text.inputEl.type = 'password';
				text
					.setPlaceholder('Enter API key...')
					.setValue(this.plugin.settings.apiKey)
					.onChange(async (value) => {
						this.plugin.settings.apiKey = value;
						await this.plugin.saveSettings();
					});
			});

		// Show custom base URL only for custom provider
		if (this.plugin.settings.aiProvider === 'custom') {
			new Setting(containerEl)
				.setName('Custom API Base URL')
				.setDesc('Base URL for your custom API provider (e.g., https://api.example.com/v1)')
				.addText((text) => text
					.setPlaceholder('https://api.example.com/v1')
					.setValue(this.plugin.settings.customBaseUrl || '')
					.onChange(async (value) => {
						this.plugin.settings.customBaseUrl = value;
						await this.plugin.saveSettings();
					}));
		}

		const modelDesc = document.createDocumentFragment();
		modelDesc.append(
			'Model to use for content generation. ',
			modelDesc.createEl('br'),
			'Available models depend on your provider:'
		);
		modelDesc.createEl('br');
		modelDesc.createEl('strong', { text: 'Anthropic:' });
		modelDesc.append(' claude-3-5-sonnet-20241022, claude-3-opus-20240229');
		modelDesc.createEl('br');
		modelDesc.createEl('strong', { text: 'OpenAI:' });
		modelDesc.append(' gpt-4-turbo-preview, gpt-4, gpt-3.5-turbo');
		modelDesc.createEl('br');
		modelDesc.createEl('strong', { text: 'Z.AI:' });
		modelDesc.append(' glm-4-plus, glm-4-air, glm-4-flash');
		modelDesc.createEl('br');
		modelDesc.createEl('strong', { text: 'DeepSeek:' });
		modelDesc.append(' deepseek-chat, deepseek-coder');
		modelDesc.createEl('br');
		modelDesc.createEl('strong', { text: 'Ali Qwen:' });
		modelDesc.append(' qwen-max, qwen-plus, qwen-turbo');

		new Setting(containerEl)
			.setName('Model')
			.setDesc(modelDesc)
			.addText((text) => text
				.setPlaceholder('Model name')
				.setValue(this.plugin.settings.model)
				.onChange(async (value) => {
					this.plugin.settings.model = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Wiki Output Path')
			.setDesc('Directory where wiki pages will be created (relative to vault root)')
			.addText((text) => text
				.setPlaceholder('wiki')
				.setValue(this.plugin.settings.wikiPath)
				.onChange(async (value) => {
					this.plugin.settings.wikiPath = value || 'wiki';
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Custom LLM Wiki Schema')
			.setDesc('Override the default LLM Wiki schema (leave empty to use built-in schema)')
			.addTextArea((text) => text
				.setPlaceholder('Enter custom schema...')
				.setValue(this.plugin.settings.customSchema)
				.onChange(async (value) => {
					this.plugin.settings.customSchema = value;
					await this.plugin.saveSettings();
				}))
			.addExtraButton((button) => button
				.setIcon('reset')
				.setTooltip('Reset to default schema')
				.onClick(async () => {
					this.plugin.settings.customSchema = '';
					await this.plugin.saveSettings();
					this.display();
				}));

		new Setting(containerEl)
			.setName('Enable Sidebar')
			.setDesc('Show the LLM Wiki sidebar panel')
			.addToggle((toggle) => toggle
				.setValue(this.plugin.settings.enableSidebar)
				.onChange(async (value) => {
					this.plugin.settings.enableSidebar = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('HTTP Server Port')
			.setDesc('Port for the built-in HTTP server (change if port 27124 is already in use)')
			.addText((text) => text
				.setPlaceholder('27124')
				.setValue(this.plugin.settings.httpServerPort.toString())
				.onChange(async (value) => {
					const port = parseInt(value);
					if (!isNaN(port) && port > 0 && port < 65536) {
						this.plugin.settings.httpServerPort = port;
						await this.plugin.saveSettings();
					}
				}))
			.addExtraButton((button) => button
				.setIcon('reset')
				.setTooltip('Restart server with new port')
				.onClick(async () => {
					// Restart the HTTP server with new port
					this.plugin.restartHttpServer();
					new Notice(`HTTP server restarted on port ${this.plugin.settings.httpServerPort}`);
				}));

		// Add information section
		containerEl.createEl('hr');
		const infoEl = containerEl.createEl('div');
		infoEl.style.marginTop = '20px';
		infoEl.innerHTML = `
			<h3>📚 Usage</h3>
			<ol>
				<li>Configure your AI Provider and API Key above</li>
				<li>Use the command palette (Ctrl/Cmd+P) and search for "LLM Wiki"</li>
				<li>Select "Process URL to Wiki" or "Process File to Wiki"</li>
				<li>Or open the sidebar and drag-drop files</li>
			</ol>
			<h3>📂 Wiki Structure</h3>
			<p>The plugin will create the following structure:</p>
			<pre>
wiki/
├── sources/      # Source summaries
├── entities/     # People, orgs, technologies
├── concepts/     # Ideas, frameworks
├── synthesis/    # Cross-source analysis
├── index.md      # Content catalog
└── log.md        # Activity log
			</pre>
			<h3>🔗 Get API Keys</h3>
			<ul>
				<li><strong>Anthropic Claude:</strong> <a href="https://console.anthropic.com">console.anthropic.com</a></li>
				<li><strong>OpenAI GPT:</strong> <a href="https://platform.openai.com">platform.openai.com</a></li>
				<li><strong>Z.AI:</strong> <a href="https://open.bigmodel.cn">open.bigmodel.cn</a></li>
				<li><strong>DeepSeek:</strong> <a href="https://platform.deepseek.com">platform.deepseek.com</a></li>
				<li><strong>Ali Qwen:</strong> <a href="https://dashscope.aliyun.com">dashscope.aliyun.com</a></li>
			</ul>
		`;
	}
}
