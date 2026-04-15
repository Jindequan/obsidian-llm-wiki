import { App, Modal, Notice, Plugin, TFile, WorkspaceLeaf } from 'obsidian';
import { LLMWikiSettingTab } from './settings';
import { SidebarView, VIEW_TYPE_SIDEBAR } from './ui/sidebar';
import { ProviderType } from './providers';
import { HttpServer } from './http-server';
import { getDesktopFilePath } from './utils/desktop';
import { encodeVaultFileSource } from './utils/file-source';

export interface LLMWikiSettings {
	aiProvider: ProviderType;
	apiKey: string;
	model: string;
	wikiPath: string;
	customSchema: string;
	enableSidebar: boolean;
	customBaseUrl?: string;
	httpServerPort: number;
}

export const DEFAULT_SETTINGS: LLMWikiSettings = {
	aiProvider: 'anthropic',
	apiKey: '',
	model: 'claude-3-5-sonnet-20241022',
	wikiPath: 'wiki',
	customSchema: '',
	enableSidebar: true,
	customBaseUrl: '',
	httpServerPort: 27124,
};

export default class LLMWikiPlugin extends Plugin {
	settings: LLMWikiSettings;
	private httpServer: HttpServer | null = null;

	async onload() {
		await this.loadSettings();

		// Initialize HTTP server
		this.httpServer = new HttpServer(this);
		await this.httpServer.start();

		// Register sidebar view
		this.registerView(
			VIEW_TYPE_SIDEBAR,
			(leaf: WorkspaceLeaf) => new SidebarView(leaf, this)
		);

		// Add ribbon icon
		this.addRibbonIcon('brain', 'LLM Wiki', () => {
			void this.activateView();
		});

		// Register commands
		this.addCommand({
			id: 'open-sidebar',
			name: 'Open sidebar',
			callback: () => {
				void this.activateView();
			},
		});

		this.addCommand({
			id: 'process-url',
			name: 'Process URL',
			callback: () => {
				void this.processUrl();
			},
		});

		this.addCommand({
			id: 'process-file',
			name: 'Process file',
			callback: () => {
				void this.processFile();
			},
		});

		this.addCommand({
			id: 'run-wiki-health-check',
			name: 'Run wiki health check',
			callback: () => {
				void this.wikiLint();
			},
		});

		// Add setting tab
		this.addSettingTab(new LLMWikiSettingTab(this.app, this));

	}

	onunload() {
		// Stop HTTP server
		if (this.httpServer) {
			this.httpServer.stop();
		}
	}

	async restartHttpServer() {
		// Stop existing server
		if (this.httpServer) {
			this.httpServer.stop();
		}

		// Start new server with new port
		this.httpServer = new HttpServer(this);
		await this.httpServer.start();
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

	getSidebarView(): SidebarView | null {
		const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_SIDEBAR)[0];
		const view = leaf?.view;
		return view instanceof SidebarView ? view : null;
	}

	async processUrl() {
		const url = await this.inputUrl();
		if (!url) return;

		new Notice('Processing URL...');

		try {
			await this.activateView();

			const sidebarView = this.getSidebarView();
			if (sidebarView) {
				await sidebarView.processUrl(url);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			new Notice(`Error: ${message}`);
		}
	}

	async processFile() {
		const file = await this.inputFile();
		if (!file) return;

		new Notice('Processing file...');

		try {
			await this.activateView();

			const sidebarView = this.getSidebarView();
			if (sidebarView) {
				await sidebarView.processFile(file);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			new Notice(`Error: ${message}`);
		}
	}

	async wikiLint() {
		new Notice('Running wiki health check...');

		try {
			await this.activateView();

			const sidebarView = this.getSidebarView();
			if (sidebarView) {
				sidebarView.runWikiLint();
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			new Notice(`Error: ${message}`);
		}
	}

	private inputUrl(): Promise<string | null> {
		return new Promise((resolve) => {
			const modal = new UrlInputModal(this.app, (url) => resolve(url));
			modal.open();
		});
	}

	private inputFile(): Promise<string | null> {
		// Use Obsidian's native file suggestion modal
		return new Promise((resolve) => {
			const inputEl = createEl('input', { type: 'file' });
			inputEl.accept = '.md,.pdf,.txt';
			inputEl.addClass('llm-wiki-hidden-file-input');
			document.body.appendChild(inputEl);

			inputEl.onchange = () => {
				void this.handleFileInputChange(inputEl, resolve);
			};

			inputEl.oncancel = () => {
				document.body.removeChild(inputEl);
				resolve(null);
			};

			inputEl.click();
		});
	}

	private async handleFileInputChange(
		inputEl: HTMLInputElement,
		resolve: (value: string | null) => void
	): Promise<void> {
		const cleanup = () => {
			if (inputEl.parentElement) {
				inputEl.remove();
			}
		};

		const selectedFile = inputEl.files?.[0];
		if (!selectedFile) {
			cleanup();
			resolve(null);
			return;
		}

		const pathFromWebUtils = getDesktopFilePath(selectedFile);
		const matchedByAbsolutePath = pathFromWebUtils ? this.findVaultFileByAbsolutePath(pathFromWebUtils) : null;
		if (matchedByAbsolutePath) {
			cleanup();
			resolve(encodeVaultFileSource(matchedByAbsolutePath.path));
			return;
		}

		const matchedByName = this.findVaultFileByName(selectedFile.name);
		if (matchedByName === 'ambiguous') {
			cleanup();
			new Notice('Multiple vault files have the same name. Paste the full local path or rename the file and try again.');
			resolve(null);
			return;
		}

		if (matchedByName) {
			cleanup();
			resolve(encodeVaultFileSource(matchedByName.path));
			return;
		}

		if (pathFromWebUtils) {
			cleanup();
			resolve(pathFromWebUtils);
			return;
		}

		cleanup();
		new Notice('Unable to resolve the selected file path in this environment.');
		resolve(null);
	}

	private findVaultFileByAbsolutePath(absolutePath: string): TFile | null {
		const normalizedTargetPath = this.normalizeSystemPath(absolutePath);

		return this.app.vault.getFiles().find((file) => {
			const resolvedPath = this.toAbsoluteVaultPath(file);
			return resolvedPath ? this.normalizeSystemPath(resolvedPath) === normalizedTargetPath : false;
		}) ?? null;
	}

	private findVaultFileByName(fileName: string): TFile | 'ambiguous' | null {
		const matches = this.app.vault.getFiles().filter((file) => file.name === fileName);
		if (matches.length > 1) {
			return 'ambiguous';
		}

		return matches[0] ?? null;
	}

	private toAbsoluteVaultPath(file: TFile): string | null {
		const adapter = this.app.vault.adapter as typeof this.app.vault.adapter & {
			basePath?: string;
			getBasePath?: () => string;
		};
		const basePath = adapter.getBasePath?.() || adapter.basePath;
		return basePath ? `${basePath}/${file.path}` : null;
	}

	private normalizeSystemPath(path: string): string {
		return path.replace(/\\/g, '/');
	}
}

// Simple URL input modal
class UrlInputModal extends Modal {
	private readonly onSubmit: (url: string) => void;

	constructor(_app: App, onSubmit: (url: string) => void) {
		super(_app);
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('div', { cls: 'modal-title', text: 'Enter a URL' });
		const input = contentEl.createEl('input', {
			type: 'url',
			cls: 'llm-wiki-modal-input',
			placeholder: 'https://...',
		});

		const btnContainer = contentEl.createEl('div', { cls: 'modal-button-container' });
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
}
