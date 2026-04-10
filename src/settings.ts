import { App, PluginSettingTab, Setting } from 'obsidian';
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

		new Setting(containerEl)
			.setName('AI Provider')
			.setDesc('Choose the AI provider for generating wiki content')
			.addDropdown((dropdown) => dropdown
				.addOption('anthropic', 'Anthropic Claude')
				.addOption('openai', 'OpenAI GPT')
				.addOption('zai', 'Z.AI')
				.addOption('deepseek', 'DeepSeek')
				.addOption('aliqwen', 'Ali Qwen')
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
					this.display(); // Refresh to show model update
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
