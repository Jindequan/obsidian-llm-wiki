import { App, ItemView, Modal, Notice, TFile, WorkspaceLeaf } from 'obsidian';
import LLMWikiPlugin from '../main';
import { createProcessor } from '../processors';
import type { ExtractedContent } from '../processors/base';
import { createProvider } from '../providers';
import { pdfBufferToMarkdown } from '../parsers/pdf-parse';
import { decodeVaultFileSource } from '../utils/file-source';
import { WikiGenerator, WikiWriteResult } from '../wiki';

export const VIEW_TYPE_SIDEBAR = 'llm-wiki-sidebar';

type LogType = 'progress' | 'success' | 'error' | 'info';

type ArtifactItem = {
	label: string;
	path: string;
	description?: string;
	isDirectory?: boolean;
};

type DroppedFile = File & {
	path?: string;
};

export class SidebarView extends ItemView {
	static readonly PRIVACY_WARNING_KEY = 'privacy-acknowledged';

	plugin: LLMWikiPlugin;
	private inputEl: HTMLInputElement;
	private processBtn: HTMLButtonElement;
	private outputEl: HTMLElement;
	private currentProcess: AbortController | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: LLMWikiPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_SIDEBAR;
	}

	getDisplayText(): string {
		return 'LLM Wiki';
	}

	getIcon(): string {
		return 'brain';
	}

	onOpen(): Promise<void> {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass('llm-wiki-sidebar');

		const shell = container.createDiv({ cls: 'llm-wiki-shell' });
		const settingsButton = this.renderHero(shell);
		const pasteButton = this.renderInputSection(shell);
		this.renderOutputSection(shell);

		this.renderEmptyState();

		settingsButton.addEventListener('click', () => this.openPluginSettings());
		this.processBtn.onclick = () => {
			void this.handleProcess();
		};
		pasteButton.addEventListener('click', () => {
			void this.pasteFromClipboard();
		});
		this.inputEl.addEventListener('keydown', (event) => {
			if (event.key === 'Enter') {
				void this.handleProcess();
			}
		});

		const dragHandler = (event: DragEvent) => {
			event.preventDefault();
			this.containerEl.addClass('llm-wiki-drag-over');
		};

		const dragLeaveHandler = (event: DragEvent) => {
			const nextTarget = event.relatedTarget as Node | null;
			if (!nextTarget || !this.containerEl.contains(nextTarget)) {
				this.containerEl.removeClass('llm-wiki-drag-over');
			}
		};

		const dropHandler = (event: DragEvent) => {
			event.preventDefault();
			this.containerEl.removeClass('llm-wiki-drag-over');
			this.handleDrop(event);
		};

		this.containerEl.addEventListener('dragover', dragHandler);
		this.containerEl.addEventListener('dragleave', dragLeaveHandler);
		this.containerEl.addEventListener('drop', dropHandler);

		this.register(() => {
			this.containerEl.removeEventListener('dragover', dragHandler);
			this.containerEl.removeEventListener('dragleave', dragLeaveHandler);
			this.containerEl.removeEventListener('drop', dropHandler);
		});

		return Promise.resolve();
	}

	onClose(): Promise<void> {
		if (this.currentProcess) {
			this.currentProcess.abort();
		}

		return Promise.resolve();
	}

	async processUrl(url: string) {
		this.inputEl.value = url;
		await this.handleProcess();
	}

	async processFile(file: string) {
		this.inputEl.value = file;
		await this.handleProcess();
	}

	async processText(text: string) {
		this.inputEl.value = text;
		await this.handleProcess();
	}

	runWikiLint() {
		this.inputEl.value = '';
		this.outputEl.empty();
		this.log('Starting wiki health check...', 'info');

		void this.performWikiLint();
	}

	private async performWikiLint() {
		try {
			const wikiPath = this.plugin.settings.wikiPath;
			const issues: string[] = [];

			// Check 1: Orphan pages (no inbound links)
			this.log('Checking for orphan pages...', 'progress');
			const orphanPages = await this.findOrphanPages(wikiPath);
			if (orphanPages.length > 0) {
				issues.push(`Found ${orphanPages.length} orphan page(s): ${orphanPages.slice(0, 5).join(', ')}${orphanPages.length > 5 ? '...' : ''}`);
				this.log(`Found ${orphanPages.length} orphan page(s)`, orphanPages.length > 10 ? 'error' : 'info');
			} else {
				this.log('No orphan pages found', 'success');
			}

			// Check 2: Missing references
			this.log('Checking for broken references...', 'progress');
			const brokenRefs = await this.findBrokenReferences(wikiPath);
			if (brokenRefs.length > 0) {
				issues.push(`Found ${brokenRefs.length} broken reference(s)`);
				this.log(`Found ${brokenRefs.length} broken reference(s)`, 'error');
			} else {
				this.log('No broken references found', 'success');
			}

			// Check 3: Empty sections
			this.log('Checking for empty sections...', 'progress');
			const emptySections = await this.findEmptySections(wikiPath);
			if (emptySections.length > 0) {
				issues.push(`Found ${emptySections.length} page(s) with empty sections`);
				this.log(`Found ${emptySections.length} page(s) with empty sections`, 'info');
			} else {
				this.log('No empty sections found', 'success');
			}

			// Summary
			this.log('Wiki health check complete!', 'success');
			if (issues.length === 0) {
				this.log('Your wiki looks healthy! No issues found.', 'success');
			} else {
				this.log(`Found ${issues.length} issue(s) to review`, 'info');
			}

		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			this.log(`Health check failed: ${message}`, 'error');
		}
	}

	private async findOrphanPages(wikiPath: string): Promise<string[]> {
		const wikiFiles = this.app.vault.getMarkdownFiles()
			.filter(f => f.path.startsWith(`${wikiPath}/`))
			.filter(f => !f.path.startsWith(`${wikiPath}/debug/`))
			.filter(f => !['index.md', 'log.md'].includes(f.name));

		const allLinks = new Set<string>();
		const pageNames = new Set<string>();

		// Collect all links and page names
		for (const file of wikiFiles) {
			pageNames.add(file.basename);
			const content = await this.app.vault.read(file);
			const links = content.matchAll(/\[\[([^\]]+)\]\]/g);
			for (const match of links) {
				const linkedPage = match[1].split('|')[0].split('#')[0].trim();
				allLinks.add(linkedPage);
			}
		}

		// Find pages that are not linked by any other page
		const orphans: string[] = [];
		for (const pageName of pageNames) {
			let hasInboundLink = false;
			for (const file of wikiFiles) {
				if (file.basename === pageName) continue;

				const content = await this.app.vault.read(file);
				if (content.includes(`[[${pageName}`)) {
					hasInboundLink = true;
					break;
				}
			}
			if (!hasInboundLink) {
				orphans.push(pageName);
			}
		}

		return orphans;
	}

	private async findBrokenReferences(wikiPath: string): Promise<string[]> {
		const wikiFiles = this.app.vault.getMarkdownFiles()
			.filter(f => f.path.startsWith(`${wikiPath}/`))
			.filter(f => !f.path.startsWith(`${wikiPath}/debug/`));

		const existingPages = new Set(
			wikiFiles.map(f => f.basename)
		);

		const brokenRefs: string[] = [];

		for (const file of wikiFiles) {
			const content = await this.app.vault.read(file);
			const links = content.matchAll(/\[\[([^\]]+)\]\]/g);

			for (const match of links) {
				const linkedPage = match[1].split('|')[0].split('#')[0].trim();
				if (!existingPages.has(linkedPage)) {
					brokenRefs.push(`${file.basename} -> [[${linkedPage}]]`);
				}
			}
		}

		return brokenRefs;
	}

	private async findEmptySections(wikiPath: string): Promise<string[]> {
		const wikiFiles = this.app.vault.getMarkdownFiles()
			.filter(f => f.path.startsWith(`${wikiPath}/`))
			.filter(f => !f.path.startsWith(`${wikiPath}/debug/`));

		const emptySectionPages: string[] = [];

		for (const file of wikiFiles) {
			const content = await this.app.vault.read(file);

			// Check for empty Summary
			const summaryMatch = content.match(/## Summary\s*\n\s*[-*]*\s*(待补充|TBD|None|\.\.\.)\s*/);
			if (summaryMatch) {
				emptySectionPages.push(file.basename);
				continue;
			}

			// Check for empty Key Points
			const keyPointsMatch = content.match(/## Key Points\s*\n\s*[-\s]*$/);
			if (keyPointsMatch) {
				emptySectionPages.push(file.basename);
				continue;
			}

			// Check for empty Connections
			const connectionsMatch = content.match(/## Connections\s*\n\s*[-\s]*None[-\s]*$/);
			if (connectionsMatch) {
				emptySectionPages.push(file.basename);
			}
		}

		return emptySectionPages;
	}

	private renderHero(shell: HTMLElement): HTMLButtonElement {
		const hero = shell.createDiv({ cls: 'llm-wiki-hero' });
		const brand = hero.createDiv({ cls: 'llm-wiki-brand' });
		const brandMain = brand.createDiv({ cls: 'llm-wiki-brand-main' });
		const logo = brandMain.createDiv({ cls: 'llm-wiki-logo', text: 'LW' });
		logo.setAttr('aria-hidden', 'true');

		const title = brandMain.createDiv({ cls: 'llm-wiki-title' });
		title.createSpan({ cls: 'llm-wiki-eyebrow', text: 'Structured knowledge capture' });
		title.createDiv({ cls: 'llm-wiki-title-text', text: 'LLM Wiki' });
		title.createEl('p', { text: 'Turn links, files, and clipboard content into structured wiki pages.' });

		const actions = brand.createDiv({ cls: 'llm-wiki-hero-actions' });
		const settingsButton = actions.createEl('button', {
			cls: 'llm-wiki-ghost-btn',
			text: 'Settings',
			type: 'button',
		});
		const status = actions.createDiv({ cls: 'llm-wiki-status' });
		status.createDiv({
			cls: `llm-wiki-status-indicator ${
				this.plugin.settings.apiKey ? 'llm-wiki-status-online' : 'llm-wiki-status-offline'
			}`,
		});
		status.createSpan({ text: this.plugin.settings.apiKey ? 'API ready' : 'API key required' });

		const meta = hero.createDiv({ cls: 'llm-wiki-meta' });
		meta.createSpan({ cls: 'llm-wiki-chip', text: this.getProviderLabel(this.plugin.settings.aiProvider) });
		meta.createSpan({ cls: 'llm-wiki-chip', text: this.plugin.settings.model });
		meta.createSpan({ cls: 'llm-wiki-chip', text: `Output: ${this.plugin.settings.wikiPath}` });

		return settingsButton;
	}

	private renderInputSection(shell: HTMLElement): HTMLButtonElement {
		const inputSection = shell.createDiv({ cls: 'llm-wiki-card' });
		const header = inputSection.createDiv({ cls: 'llm-wiki-card-header' });
		const heading = header.createDiv();
		heading.createDiv({ cls: 'llm-wiki-card-title', text: 'Start ingest' });
		heading.createEl('p', { text: 'Supports URLs, local file paths, and quick paste from the clipboard.' });
		header.createDiv({ cls: 'llm-wiki-shortcut', text: 'Enter' });

		const surface = inputSection.createDiv({ cls: 'llm-wiki-input-surface' });
		const row = surface.createDiv({ cls: 'llm-wiki-input-row' });
		this.inputEl = row.createEl('input', {
			cls: 'llm-wiki-input',
			attr: {
				type: 'text',
				placeholder: 'Enter a URL or file path, for example https://example.com or /Users/me/file.pdf',
			},
		});
		this.processBtn = row.createEl('button', {
			cls: 'llm-wiki-btn-primary',
			type: 'button',
		});
		this.processBtn.createSpan({ cls: 'llm-wiki-btn-label', text: 'Process' });

		const actions = surface.createDiv({ cls: 'llm-wiki-input-actions' });
		const pasteButton = actions.createEl('button', {
			cls: 'llm-wiki-link-btn',
			text: 'Paste clipboard',
			type: 'button',
		});
		const hints = actions.createDiv({ cls: 'llm-wiki-hints' });
		hints.createSpan({ cls: 'llm-wiki-hint', text: 'Drag files here' });
		hints.createSpan({ cls: 'llm-wiki-hint', text: 'Auto-detect URL or file' });

		if (!this.plugin.settings.apiKey) {
			inputSection.createDiv({
				cls: 'llm-wiki-inline-note',
				text: 'No API key is configured yet. Open plugin settings before processing content.',
			});
		}

		return pasteButton;
	}

	private renderOutputSection(shell: HTMLElement): void {
		const outputSection = shell.createDiv({ cls: 'llm-wiki-card llm-wiki-log-card' });
		const header = outputSection.createDiv({ cls: 'llm-wiki-card-header' });
		const heading = header.createDiv();
		heading.createDiv({ cls: 'llm-wiki-card-title', text: 'Activity log' });
		heading.createEl('p', { text: 'This panel shows the full fetch, analysis, and wiki writing workflow.' });
		header.createDiv({ cls: 'llm-wiki-log-pill', text: 'Live' });

		this.outputEl = outputSection.createDiv({ cls: 'llm-wiki-log' });
	}

	private renderEmptyState() {
		this.outputEl.empty();
		const emptyState = this.outputEl.createDiv({ cls: 'llm-wiki-log-empty' });
		emptyState.createEl('h3', { text: 'Ready to process content' });
		emptyState.createEl('p', {
			text: 'Enter a web link or local file path and LLM Wiki will generate structured pages automatically.',
		});
		const steps = emptyState.createDiv({ cls: 'llm-wiki-log-empty-steps' });
		steps.createSpan({ text: '1. Capture the source content' });
		steps.createSpan({ text: '2. Extract entities and concepts with AI' });
		steps.createSpan({ text: '3. Write wiki pages, index, and log' });
	}

	private setProcessingState(isProcessing: boolean) {
		this.processBtn.disabled = isProcessing;
		this.processBtn.toggleClass('is-loading', isProcessing);

		const labelEl = this.processBtn.querySelector('.llm-wiki-btn-label');
		if (labelEl) {
			labelEl.textContent = isProcessing ? 'Processing...' : 'Process';
		}
	}

	private async handleProcess() {
		const input = this.inputEl.value.trim();
		if (!input) {
			new Notice('Enter a URL, file path, or paste text content.');
			this.inputEl.focus();
			return;
		}

		if (!this.plugin.settings.apiKey) {
			this.log('Configure an API key in the plugin settings before processing.', 'error');
			return;
		}

		// Privacy warning before sending content to AI
		const confirmed = await this.confirmPrivacyWarning();
		if (!confirmed) {
			this.log('Processing cancelled by user.', 'info');
			return;
		}

		if (this.currentProcess) {
			this.currentProcess.abort();
		}

		this.currentProcess = new AbortController();
		this.setProcessingState(true);
		this.outputEl.empty();

		try {
			if (this.isUrl(input)) {
				await this.processUrlContent(input, this.currentProcess.signal);
			} else if (this.isFilePath(input)) {
				await this.processFileContent(input, this.currentProcess.signal);
			} else {
				// Treat as text content
				await this.processTextContent(input, this.currentProcess.signal);
			}
		} catch (error) {
			if (!(error instanceof Error) || error.name !== 'AbortError') {
				const message = error instanceof Error ? error.message : 'Unknown error';
				const debugArtifacts = this.extractArtifactPathsFromError(message);
				if (debugArtifacts.length > 0) {
					this.renderArtifacts('Failure artifacts', debugArtifacts, 'Debug artifacts were found and can be opened directly.');
				}
				new Notice(`Processing failed: ${message}`);
			}
		} finally {
			this.setProcessingState(false);
			this.currentProcess = null;
		}
	}

	private async processUrlContent(url: string, signal: AbortSignal) {
		const processor = await this.runLoggedStep(
			'Initializing URL processor.',
			'URL processor ready.',
			() => Promise.resolve(createProcessor('url')),
			(error) => `Failed to initialize the URL processor: ${error.message}`
		);
		this.log(`Source URL: ${url}`, 'info');

		const content = await this.runLoggedStep(
			'Downloading and extracting page content.',
			'Page content extracted.',
			() => processor.extract(url),
			(error) => `Failed to extract page content: ${error.message}`
		);

		if (signal.aborted) {
			throw new Error('Cancelled');
		}

		this.log(`Extracted title: ${content.title}`, 'success');
		this.log(`Content length: ${content.content.length} characters`, 'info');

		await this.generateWiki(content, signal);
	}

	private async processFileContent(filePath: string, signal: AbortSignal) {
		const content = await this.runLoggedStep(
			`Reading file: ${filePath}`,
			'File read complete.',
			() => {
				const vaultPath = decodeVaultFileSource(filePath);
				return vaultPath ? this.extractVaultFileContent(vaultPath) : createProcessor('file').extract(filePath);
			},
			(error) => `Failed to read file: ${error.message}`
		);

		if (signal.aborted) {
			throw new Error('Cancelled');
		}

		this.log(`Extracted title: ${content.title}`, 'success');
		this.log(`Content length: ${content.content.length} characters`, 'info');

		await this.generateWiki(content, signal);
	}

	private async generateWiki(content: ExtractedContent, signal: AbortSignal) {
		const provider = createProvider(
			this.plugin.settings.aiProvider,
			this.plugin.settings.apiKey,
			this.plugin.settings.model,
			this.plugin.settings.customBaseUrl
		);

		const generator = new WikiGenerator(
			this.plugin.app,
			provider,
			this.plugin.settings.wikiPath,
			this.plugin.settings.customSchema || undefined
		);

		const result = await this.runLoggedStep(
			'Calling the AI provider to analyze entities, concepts, and connections.',
			(generated) => `Analysis complete. Generated ${generated.entityPages.length} entity pages and ${generated.conceptPages.length} concept pages.`,
			() => generator.generate(content),
			(error) => `AI analysis failed: ${error.message}`
		);

		if (signal.aborted) {
			throw new Error('Cancelled');
		}

		const writeResult = await this.runLoggedStep(
			'Writing wiki pages.',
			'Wiki pages written.',
			() => generator.writePages(result),
			(error) => `Wiki write failed: ${error.message}`
		);

		this.log('Wiki generation complete.', 'success');
		this.log(`Source page: ${result.sourcePage.path}`, 'success');
		this.log(`Entity pages: ${result.entityPages.length}`, 'success');
		this.log(`Concept pages: ${result.conceptPages.length}`, 'success');
		this.renderArtifacts('Generated artifacts', this.buildSuccessArtifacts(writeResult), 'Open the generated files directly or jump to the output folder.');

		new Notice('LLM Wiki pages generated.');
	}

	private isUrl(text: string): boolean {
		try {
			new URL(text);
			return true;
		} catch {
			return false;
		}
	}

	private isFilePath(text: string): boolean {
		// Check if it looks like a file path
		return decodeVaultFileSource(text) !== null ||
		       text.startsWith('/') ||
		       text.startsWith('./') ||
		       text.startsWith('../') ||
		       /^[a-zA-Z]:/.test(text) || // Windows path
		       text.endsWith('.md') ||
		       text.endsWith('.txt') ||
		       text.endsWith('.pdf');
	}

	private async extractVaultFileContent(vaultPath: string): Promise<ExtractedContent> {
		const file = this.app.vault.getAbstractFileByPath(vaultPath);
		if (!(file instanceof TFile)) {
			throw new Error(`Vault file not found: ${vaultPath}`);
		}

		const extension = file.extension.toLowerCase();
		if (extension === 'pdf') {
			return this.extractVaultPdfContent(file);
		}

		if (extension === 'md' || extension === 'markdown') {
			return this.extractVaultTextContent(file, 'markdown');
		}

		if (extension === 'txt') {
			return this.extractVaultTextContent(file, 'text');
		}

		throw new Error(`Unsupported file type: ${extension}`);
	}

	private async extractVaultPdfContent(file: TFile): Promise<ExtractedContent> {
		const adapter = this.app.vault.adapter as typeof this.app.vault.adapter & {
			readBinary?: (normalizedPath: string) => Promise<ArrayBuffer | Uint8Array>;
		};
		if (!adapter.readBinary) {
			throw new Error('Vault PDF reading is not available in the current environment.');
		}

		const binary = await adapter.readBinary(file.path);
		const data = binary instanceof Uint8Array ? binary : new Uint8Array(binary);
		const { title, content } = await pdfBufferToMarkdown(data, file.name);

		return {
			type: 'file',
			source: file.path,
			title,
			content,
			metadata: {
				extractedAt: new Date().toISOString(),
				wordCount: content.split(/\s+/).length,
				format: 'pdf',
				vaultPath: file.path,
			},
		};
	}

	private async extractVaultTextContent(file: TFile, format: 'markdown' | 'text'): Promise<ExtractedContent> {
		const content = await this.app.vault.read(file);
		const title = format === 'markdown'
			? content.match(/^#\s+(.+)$/m)?.[1] || file.basename || 'Untitled'
			: file.basename || 'Untitled';

		return {
			type: 'file',
			source: file.path,
			title,
			content,
			metadata: {
				extractedAt: new Date().toISOString(),
				wordCount: content.split(/\s+/).length,
				format,
				vaultPath: file.path,
			},
		};
	}

	private async processTextContent(text: string, signal: AbortSignal) {
		this.log('Processing text content...', 'info');

		const content: ExtractedContent = {
			type: 'file',
			source: 'clipboard',
			title: 'Clipboard content',
			content: text,
			metadata: {
				extractedAt: new Date().toISOString(),
				wordCount: text.split(/\s+/).length,
			},
		};

		if (signal.aborted) {
			throw new Error('Cancelled');
		}

		this.log(`Content length: ${content.content.length} characters`, 'info');

		await this.generateWiki(content, signal);
	}

	private async pasteFromClipboard() {
		try {
			const text = await navigator.clipboard.readText();
			this.inputEl.value = text;
			this.inputEl.focus();
		} catch {
			this.log('Unable to read clipboard content.', 'error');
		}
	}

	private handleDrop(event: DragEvent) {
		const files = event.dataTransfer?.files;
		if (!files || files.length === 0) {
			return;
		}

		const file = files[0] as DroppedFile;
		const filePath = this.resolveDroppedFilePath(file);
		if (!filePath) {
			new Notice('Unable to resolve the dropped file path. Please paste the full local path or use the command palette file picker.');
			this.log(`Dropped file path could not be resolved for: ${file.name}`, 'error');
			return;
		}

		this.inputEl.value = filePath;
		this.log(`Imported dropped file: ${filePath}`, 'info');
	}

	private resolveDroppedFilePath(file: DroppedFile): string | null {
		if (file.path) {
			return file.path;
		}

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
				return pathFromWebUtils;
			}
		} catch {
			// Ignore desktop-specific path lookup errors and fall back to a visible validation message.
		}

		return null;
	}

	private buildSuccessArtifacts(writeResult: WikiWriteResult): ArtifactItem[] {
		const pageArtifacts = writeResult.pages
			.filter((page) => page.operation !== 'skipped')
			.map((page) => ({
				label: `${this.getArtifactTypeLabel(page.type)} · ${page.operation === 'created' ? 'created' : 'updated'}`,
				path: page.path,
				description: page.path,
			}));

		return [
			{
				label: 'Wiki output folder',
				path: writeResult.wikiPath,
				description: `Folder: ${writeResult.wikiPath}`,
				isDirectory: true,
			},
			{
				label: `Raw source page · ${writeResult.rawOperation === 'created' ? 'created' : 'reused'}`,
				path: writeResult.rawPath,
				description: writeResult.rawPath,
			},
			...pageArtifacts,
			{
				label: 'Index page',
				path: writeResult.indexPath,
				description: writeResult.indexPath,
			},
			{
				label: 'Log page',
				path: writeResult.logPath,
				description: writeResult.logPath,
			},
		];
	}

	private extractArtifactPathsFromError(message: string): ArtifactItem[] {
		const matches = [...message.matchAll(/((?:[^\s]+\/)?debug\/[^\s]+\.txt)/g)];
		const uniquePaths = [...new Set(matches.map((match) => match[1]))];

		if (!uniquePaths.length) {
			return [];
		}

		const artifacts: ArtifactItem[] = [
			{
				label: 'Debug folder',
				path: `${this.plugin.settings.wikiPath}/debug`,
				description: `Folder: ${this.plugin.settings.wikiPath}/debug`,
				isDirectory: true,
			},
		];

		uniquePaths.forEach((path, index) => {
			artifacts.push({
				label: `Debug file ${index + 1}`,
				path,
				description: path,
			});
		});

		return artifacts;
	}

	private renderArtifacts(title: string, artifacts: ArtifactItem[], note?: string) {
		this.outputEl.querySelector('.llm-wiki-artifacts')?.remove();
		if (!artifacts.length) {
			return;
		}

		const wrapper = this.outputEl.createDiv({ cls: 'llm-wiki-artifacts' });
		const header = wrapper.createDiv({ cls: 'llm-wiki-artifacts-header' });
		header.createEl('div', { cls: 'llm-wiki-artifacts-title', text: title });
		if (note) {
			header.createEl('p', { cls: 'llm-wiki-artifacts-note', text: note });
		}

		const list = wrapper.createDiv({ cls: 'llm-wiki-artifact-list' });
		artifacts.forEach((artifact) => {
			const item = list.createDiv({ cls: 'llm-wiki-artifact-item' });
			const main = item.createDiv({ cls: 'llm-wiki-artifact-main' });
			main.createEl('div', { cls: 'llm-wiki-artifact-label', text: artifact.label });
			if (artifact.description) {
				main.createEl('div', { cls: 'llm-wiki-artifact-description', text: artifact.description });
			}
			main.createEl('div', { cls: 'llm-wiki-artifact-path', text: artifact.path });

			const actions = item.createDiv({ cls: 'llm-wiki-artifact-actions' });
			if (!artifact.isDirectory) {
				const openFileBtn = actions.createEl('button', {
					cls: 'llm-wiki-link-btn',
					text: 'Open file',
					type: 'button',
				});
				openFileBtn.addEventListener('click', () => {
					void this.openArtifactFile(artifact.path);
				});
			}

			const openDirBtn = actions.createEl('button', {
				cls: 'llm-wiki-link-btn',
				text: 'Open folder',
				type: 'button',
			});
			openDirBtn.addEventListener('click', () => {
				void this.openArtifactDirectory(artifact.isDirectory ? artifact.path : this.getParentPath(artifact.path));
			});
		});

		this.outputEl.scrollTop = this.outputEl.scrollHeight;
	}

	private async openArtifactFile(path: string) {
		const resolvedPath = this.resolveArtifactVaultPath(path);
		const file = this.app.vault.getAbstractFileByPath(resolvedPath);
		if (file instanceof TFile) {
			const leaf = this.app.workspace.getLeaf(true);
			await leaf.openFile(file);
			return;
		}

		await this.openArtifactDirectory(this.getParentPath(resolvedPath));
	}

	private async openArtifactDirectory(path: string) {
		const resolvedPath = this.resolveArtifactVaultPath(path);
		const absolutePath = this.toAbsoluteVaultPath(resolvedPath);
		if (!absolutePath) {
			new Notice(`Could not locate folder: ${resolvedPath}`);
			return;
		}

		try {
			const localWindow = window as typeof window & {
				require?: (module: string) => { shell?: { openPath: (targetPath: string) => Promise<string> } };
			};
			const shell = localWindow.require?.('electron')?.shell;
			if (!shell) {
				new Notice('Opening system folders is not supported in the current environment.');
				return;
			}

			const result = await shell.openPath(absolutePath);
			if (result) {
				new Notice(`Failed to open folder: ${result}`);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			new Notice(`Failed to open folder: ${message}`);
		}
	}

	private resolveArtifactVaultPath(path: string): string {
		const normalizedPath = path.replace(/^\.?\//, '').replace(/^\/+/, '');
		const normalizedWikiPath = this.plugin.settings.wikiPath.replace(/^\.?\//, '').replace(/^\/+/, '').replace(/\/+$/, '');

		if (!normalizedPath || !normalizedWikiPath) {
			return normalizedPath || normalizedWikiPath;
		}

		if (normalizedPath === normalizedWikiPath || normalizedPath.startsWith(`${normalizedWikiPath}/`)) {
			return normalizedPath;
		}

		if (this.app.vault.getAbstractFileByPath(normalizedPath)) {
			return normalizedPath;
		}

		return `${normalizedWikiPath}/${normalizedPath}`;
	}

	private toAbsoluteVaultPath(path: string): string | null {
		const adapter = this.app.vault.adapter as typeof this.app.vault.adapter & {
			basePath?: string;
			getBasePath?: () => string;
		};
		const basePath = adapter.getBasePath?.() || adapter.basePath;
		if (!basePath) {
			return null;
		}

		const normalizedPath = path.replace(/^\.?\//, '').replace(/^\/+/, '');
		return normalizedPath ? `${basePath}/${normalizedPath}` : basePath;
	}

	private getParentPath(path: string): string {
		const normalizedPath = path.replace(/\/+$/, '');
		const segments = normalizedPath.split('/');
		segments.pop();
		return segments.join('/');
	}

	private getArtifactTypeLabel(type: WikiWriteResult['pages'][number]['type']): string {
		if (type === 'source') {
			return 'Source page';
		}

		if (type === 'entity') {
			return 'Entity page';
		}

		return 'Concept page';
	}

	private openPluginSettings() {
		const appWithSettings = this.app as typeof this.app & {
			setting?: {
				open?: () => void;
				openTabById?: (id: string) => void;
			};
		};

		const settingsManager = appWithSettings.setting;
		if (!settingsManager?.open) {
			new Notice('Cannot open the settings page directly in the current environment. Open the plugin settings manually.');
			return;
		}

		settingsManager.open();
		if (settingsManager.openTabById) {
			settingsManager.openTabById(this.plugin.manifest.id);
			return;
		}

		new Notice('The settings panel is open. Find LLM Wiki under Community Plugins.');
	}

	private async runLoggedStep<T>(
		pendingMessage: string,
		successMessage: string | ((result: T) => string),
		task: () => T | Promise<T>,
		errorMessage?: (error: Error) => string
	): Promise<T> {
		const line = this.log(pendingMessage, 'progress');

		try {
			const result = await task();
			const resolvedMessage = typeof successMessage === 'function'
				? successMessage(result)
				: successMessage;
			this.updateLogEntry(line, resolvedMessage, 'success');
			return result;
		} catch (error) {
			const resolvedError = error instanceof Error ? error : new Error('Unknown error');
			const resolvedMessage = errorMessage?.(resolvedError) || `Failed: ${resolvedError.message}`;
			this.updateLogEntry(line, resolvedMessage, 'error');
			throw resolvedError;
		}
	}

	private log(message: string, type: LogType = 'progress'): HTMLDivElement {
		if (this.outputEl.querySelector('.llm-wiki-log-empty')) {
			this.outputEl.empty();
		}

		const line = this.outputEl.createDiv({
			cls: `llm-wiki-log-line llm-wiki-${type}`
		});
		const badge = line.createEl('span', { cls: 'llm-wiki-log-badge' });
		badge.textContent = this.getLogLabel(type);

		const messageEl = line.createEl('div', { cls: 'llm-wiki-log-message' });
		messageEl.textContent = message;

		const timeEl = line.createEl('span', { cls: 'llm-wiki-log-time' });
		timeEl.textContent = new Date().toLocaleTimeString('en-US', {
			hour: '2-digit',
			minute: '2-digit'
		});

		this.outputEl.scrollTop = this.outputEl.scrollHeight;
		return line;
	}

	private updateLogEntry(line: HTMLDivElement, message: string, type: LogType) {
		line.removeClass('llm-wiki-progress', 'llm-wiki-success', 'llm-wiki-error', 'llm-wiki-info');
		line.addClass(`llm-wiki-${type}`);

		const badge = line.querySelector('.llm-wiki-log-badge');
		if (badge) {
			badge.textContent = this.getLogLabel(type);
		}

		const messageEl = line.querySelector('.llm-wiki-log-message');
		if (messageEl) {
			messageEl.textContent = message;
		}

		this.outputEl.scrollTop = this.outputEl.scrollHeight;
	}

	private getLogLabel(type: LogType): string {
		if (type === 'success') {
			return 'Done';
		}

		if (type === 'info') {
			return 'Info';
		}

		if (type === 'error') {
			return 'Error';
		}

		return 'Working';
	}

	private getProviderLabel(provider: string): string {
		const labels: Record<string, string> = {
			anthropic: 'Anthropic',
			openai: 'OpenAI',
			zai: 'Z.AI',
			deepseek: 'DeepSeek',
			aliqwen: 'Ali Qwen',
			custom: 'Custom'
		};

		return labels[provider] || provider;
	}

	private confirmPrivacyWarning(): Promise<boolean> {
		if (this.app.loadLocalStorage(SidebarView.PRIVACY_WARNING_KEY) === true) {
			return Promise.resolve(true);
		}

		return new Promise((resolve) => {
			const modal = new PrivacyWarningModal(this.app, this.plugin.settings.aiProvider, (confirmed) => {
				resolve(confirmed);
			});
			modal.open();
		});
	}
}

class PrivacyWarningModal extends Modal {
	private readonly provider: string;
	private readonly onSubmit: (confirmed: boolean) => void;
	private rememberChoice = false;

	constructor(app: App, provider: string, onSubmit: (confirmed: boolean) => void) {
		super(app);
		this.provider = provider;
		this.onSubmit = onSubmit;
	}

	onOpen(): void {
		this.containerEl.addClass('llm-wiki-privacy-modal');
		this.titleEl.setText('Privacy notice');
		this.contentEl.empty();

		const header = this.contentEl.createDiv({ cls: 'llm-wiki-privacy-header-row' });
		header.createDiv({ cls: 'llm-wiki-logo', text: '!' });
		header.createEl('h3', { cls: 'llm-wiki-privacy-title', text: 'Privacy notice' });

		const message = this.contentEl.createDiv({ cls: 'llm-wiki-privacy-message' });
		message.createEl('p', {
			text: `Your content will be sent to ${this.provider} for processing. This means:`,
		});
		const list = message.createEl('ul');
		list.createEl('li', { text: `Your content will be processed by ${this.provider}'s servers.` });
		list.createEl('li', { text: `Data handling depends on ${this.provider}'s terms and privacy policy.` });
		list.createEl('li', { text: 'Avoid processing sensitive, confidential, or personal information.' });
		message.createEl('p', { text: 'Do you want to continue?' });

		const buttonContainer = this.contentEl.createDiv({ cls: 'modal-button-container' });
		buttonContainer.createEl('button', { text: 'Cancel', type: 'button' }).onclick = () => {
			this.onSubmit(false);
			this.close();
		};
		const confirmButton = buttonContainer.createEl('button', {
			cls: 'mod-cta',
			text: 'Continue',
			type: 'button',
		});
		confirmButton.onclick = () => {
			this.app.saveLocalStorage(SidebarView.PRIVACY_WARNING_KEY, this.rememberChoice ? true : null);
			this.onSubmit(true);
			this.close();
		};

		const footer = this.contentEl.createDiv({ cls: 'llm-wiki-privacy-footer' });
		const checkboxRow = footer.createDiv({ cls: 'llm-wiki-privacy-checkbox-row' });
		const checkbox = checkboxRow.createEl('input', { type: 'checkbox' });
		checkbox.id = 'llm-wiki-dont-show-again';
		checkbox.addEventListener('change', () => {
			this.rememberChoice = checkbox.checked;
		});
		const label = checkboxRow.createEl('label', {
			cls: 'llm-wiki-privacy-label',
			text: "Don't show this warning again (you understand the risks).",
		});
		label.htmlFor = checkbox.id;

		window.setTimeout(() => confirmButton.focus(), 50);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
