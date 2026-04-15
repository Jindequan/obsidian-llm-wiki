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
		new Setting(containerEl).setName('LLM Wiki settings').setHeading();
		this.renderBrowserExtensionNotice(containerEl);

		new Setting(containerEl)
			.setName('AI provider')
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
			.setName('API key')
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
				.setName('Custom API base URL')
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
			.setName('Wiki output path')
			.setDesc('Directory where wiki pages will be created (relative to vault root)')
			.addText((text) => text
				.setPlaceholder('wiki')
				.setValue(this.plugin.settings.wikiPath)
				.onChange(async (value) => {
					this.plugin.settings.wikiPath = value || 'wiki';
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Custom LLM Wiki schema')
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
			.setName('Enable sidebar')
			.setDesc('Show the LLM Wiki sidebar panel')
			.addToggle((toggle) => toggle
				.setValue(this.plugin.settings.enableSidebar)
				.onChange(async (value) => {
					this.plugin.settings.enableSidebar = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('HTTP server port')
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

		containerEl.createEl('hr');
		this.renderUsageInfo(containerEl);
	}

	private renderBrowserExtensionNotice(containerEl: HTMLElement): void {
		const settingItem = containerEl.createDiv({ cls: 'setting-item' });
		const callout = settingItem.createDiv({ cls: 'llm-wiki-settings-callout' });
		callout.createDiv({ cls: 'llm-wiki-settings-callout-title', text: 'Browser extension' });
		callout.createEl('p', {
			cls: 'llm-wiki-settings-callout-text',
			text: 'This plugin includes a built-in HTTP server for browser extension integration.',
		});
		const serverLine = callout.createEl('p', { cls: 'llm-wiki-settings-callout-text' });
		serverLine.appendText('Server running at: ');
		serverLine.createEl('strong', { text: `http://localhost:${this.plugin.settings.httpServerPort}` });
		callout.createEl('p', {
			cls: 'llm-wiki-settings-callout-text',
			text: 'Install the browser extension to send URLs from your browser directly to Obsidian.',
		});
	}

	private renderUsageInfo(containerEl: HTMLElement): void {
		const infoEl = containerEl.createDiv({ cls: 'llm-wiki-settings-info' });

		new Setting(infoEl).setName('Usage').setHeading();
		const usageList = infoEl.createEl('ol');
		[
			'Configure your AI provider and API key above.',
			'Open the command palette and search for LLM Wiki.',
			'Choose Process URL to Wiki or Process File to Wiki.',
			'Or open the sidebar and drag and drop files.',
		].forEach((step) => usageList.createEl('li', { text: step }));

		new Setting(infoEl).setName('Wiki structure').setHeading();
		infoEl.createEl('p', { text: 'The plugin creates the following structure:' });
		infoEl.createEl('pre', {
			text:
				'wiki/\n' +
				'|- sources/      # Source summaries\n' +
				'|- entities/     # People, orgs, technologies\n' +
				'|- concepts/     # Ideas, frameworks\n' +
				'|- synthesis/    # Cross-source analysis\n' +
				'|- index.md      # Content catalog\n' +
				"'-- log.md       # Activity log",
		});

		new Setting(infoEl).setName('Get API keys').setHeading();
		const keyList = infoEl.createEl('ul');
		this.createResourceLink(keyList, 'Anthropic Claude', 'https://console.anthropic.com', 'console.anthropic.com');
		this.createResourceLink(keyList, 'OpenAI GPT', 'https://platform.openai.com', 'platform.openai.com');
		this.createResourceLink(keyList, 'Z.AI', 'https://open.bigmodel.cn', 'open.bigmodel.cn');
		this.createResourceLink(keyList, 'DeepSeek', 'https://platform.deepseek.com', 'platform.deepseek.com');
		this.createResourceLink(keyList, 'Ali Qwen', 'https://dashscope.aliyun.com', 'dashscope.aliyun.com');
	}

	private createResourceLink(parent: HTMLElement, label: string, href: string, text: string): void {
		const item = parent.createEl('li');
		item.createEl('strong', { text: `${label}: ` });
		item.createEl('a', { href, text });
	}
}
