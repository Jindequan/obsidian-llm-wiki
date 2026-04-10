import { App, Plugin, PluginSettingTab, Setting, Notice, TFile, WorkspaceLeaf } from 'obsidian';
import { LLMWikiSettingTab } from './settings';
import { SidebarView, VIEW_TYPE_SIDEBAR } from './ui/sidebar';
import { ProviderType } from './providers';

export interface LLMWikiSettings {
	aiProvider: ProviderType;
	apiKey: string;
	model: string;
	wikiPath: string;
	customSchema: string;
	enableSidebar: boolean;
	customBaseUrl?: string;
}

export const DEFAULT_SETTINGS: LLMWikiSettings = {
	aiProvider: 'anthropic',
	apiKey: '',
	model: 'claude-3-5-sonnet-20241022',
	wikiPath: 'wiki',
	customSchema: '',
	enableSidebar: true,
	customBaseUrl: '',
};

export default class LLMWikiPlugin extends Plugin {
	settings: LLMWikiSettings;
	private sidebarView: SidebarView | null = null;

	async onload() {
		await this.loadSettings();

		// Register sidebar view
		this.registerView(
			VIEW_TYPE_SIDEBAR,
			(leaf: WorkspaceLeaf) => {
				this.sidebarView = new SidebarView(leaf, this);
				return this.sidebarView;
			}
		);

		// Add ribbon icon
		this.addRibbonIcon('brain', 'LLM Wiki', () => {
			this.activateView();
		});

		// Register commands
		this.addCommand({
			id: 'open-llm-wiki-sidebar',
			name: 'Open LLM Wiki sidebar',
			callback: () => this.activateView(),
		});

		this.addCommand({
			id: 'process-url',
			name: 'Process URL to Wiki',
			callback: () => this.processUrl(),
		});

		this.addCommand({
			id: 'process-file',
			name: 'Process File to Wiki',
			callback: () => this.processFile(),
		});

		this.addCommand({
			id: 'wiki-lint',
			name: 'Wiki health check',
			callback: () => this.wikiLint(),
		});

		// Add setting tab
		this.addSettingTab(new LLMWikiSettingTab(this.app, this));

		console.log('LLM Wiki plugin loaded');
	}

	onunload() {
		console.log('LLM Wiki plugin unloaded');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async activateView() {
		const { workspace } = this.app;

		const existing = workspace.getLeavesOfType(VIEW_TYPE_SIDEBAR);
		let leaf: WorkspaceLeaf;

		if (existing.length > 0) {
			leaf = existing[0];
		} else {
			leaf = workspace.getLeftLeaf(false);
		}

		await leaf.setViewState({ type: VIEW_TYPE_SIDEBAR, active: true });
		workspace.revealLeaf(leaf);
	}

	async processUrl() {
		const url = await this.inputUrl();
		if (!url) return;

		new Notice('Processing URL...');

		try {
			await this.activateView();

			if (this.sidebarView) {
				this.sidebarView.processUrl(url);
			}
		} catch (error: any) {
			new Notice(`Error: ${error.message}`);
		}
	}

	async processFile() {
		const file = await this.inputFile();
		if (!file) return;

		new Notice('Processing file...');

		try {
			await this.activateView();

			if (this.sidebarView) {
				this.sidebarView.processFile(file.path);
			}
		} catch (error: any) {
			new Notice(`Error: ${error.message}`);
		}
	}

	async wikiLint() {
		new Notice('Running wiki health check...');

		try {
			await this.activateView();

			if (this.sidebarView) {
				this.sidebarView.runWikiLint();
			}
		} catch (error: any) {
			new Notice(`Error: ${error.message}`);
		}
	}

	private async inputUrl(): Promise<string | null> {
		return new Promise((resolve) => {
			const modal = new UrlInputModal(this.app, (url) => resolve(url));
			modal.open();
		});
	}

	private async inputFile(): Promise<TFile | null> {
		// Use Obsidian's native file suggestion modal
		return new Promise((resolve) => {
			const inputEl = createEl('input', { type: 'file' });
			inputEl.accept = '.md,.pdf,.txt';
			inputEl.style.display = 'none';
			document.body.appendChild(inputEl);

			inputEl.onchange = async () => {
				const file = inputEl.files?.[0];
				if (file) {
					// For desktop app, try to get the full path
					try {
						const electron = (window as Window & {
							require?: (module: string) => {
								webUtils?: {
									getPathForFile?: (target: File) => string;
								};
							};
						}).require?.('electron');

						const pathFromWebUtils = electron?.webUtils?.getPathForFile?.(file);
						if (pathFromWebUtils) {
							document.body.removeChild(inputEl);
							resolve(this.app.vault.getAbstractFileByPath(pathFromWebUtils) as TFile || null);
							return;
						}
					} catch {
						// Fall back to vault-relative path
					}

					// Try to find file in vault by name
					const files = this.app.vault.getFiles();
					const matched = files.find(f => f.name === file.name);
					document.body.removeChild(inputEl);
					resolve(matched as TFile || null);
					return;
				}
				document.body.removeChild(inputEl);
				resolve(null);
			};

			inputEl.oncancel = () => {
				document.body.removeChild(inputEl);
				resolve(null);
			};

			inputEl.click();
		});
	}
}

// Simple URL input modal
class UrlInputModal {
	private modalEl: HTMLElement;
	private onSubmit: (url: string) => void;

	constructor(app: App, onSubmit: (url: string) => void) {
		this.onSubmit = onSubmit;

		this.modalEl = document.createElement('div');
		this.modalEl.className = 'modal-container';

		const modal = this.modalEl.createEl('div', { cls: 'modal' });
		modal.createEl('div', { cls: 'modal-title', text: 'Enter URL' });

		const content = modal.createEl('div', { cls: 'modal-content' });
		const input = content.createEl('input', {
			type: 'url',
			placeholder: 'https://...',
		});
		input.style.width = '100%';
		input.style.padding = '8px';

		const btnContainer = modal.createEl('div', { cls: 'modal-button-container' });
		const submitBtn = btnContainer.createEl('button', {
			cls: 'mod-cta',
			text: 'Process'
		});
		const cancelBtn = btnContainer.createEl('button', { text: 'Cancel' });

		submitBtn.onclick = () => {
			this.onSubmit(input.value);
			this.close();
		};

		cancelBtn.onclick = () => this.close();

		input.focus();
		input.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				this.onSubmit(input.value);
				this.close();
			}
		});
	}

	open() {
		document.body.appendChild(this.modalEl);
	}

	close() {
		this.modalEl.remove();
	}
}
