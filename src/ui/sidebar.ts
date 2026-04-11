import { App, ItemView, Notice, TFile, WorkspaceLeaf } from 'obsidian';
import LLMWikiPlugin from '../main';
import { createProcessor } from '../processors';
import { createProvider } from '../providers';
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
	private static readonly STYLE_ID = 'llm-wiki-sidebar-styles';

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

	async onOpen() {
		this.ensureStyles();

		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass('llm-wiki-sidebar');

		const shell = container.createDiv({ cls: 'llm-wiki-shell' });

		const hero = shell.createDiv({ cls: 'llm-wiki-hero' });
		hero.innerHTML = `
			<div class="llm-wiki-brand">
				<div class="llm-wiki-brand-main">
					<div class="llm-wiki-logo">
						<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/>
							<path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/>
						</svg>
					</div>
					<div class="llm-wiki-title">
						<span class="llm-wiki-eyebrow">Structured Knowledge Capture</span>
						<div class="llm-wiki-title-text">LLM Wiki</div>
						<p>Turn links, files, and clipboard content into structured wiki pages.</p>
					</div>
				</div>
				<div class="llm-wiki-hero-actions">
					<button class="llm-wiki-ghost-btn" type="button" data-action="open-settings">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<circle cx="12" cy="12" r="3"/>
							<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01A1.65 1.65 0 0 0 9.94 3.1V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
						</svg>
						<span>Settings</span>
					</button>
					<div class="llm-wiki-status">
						<div class="llm-wiki-status-indicator ${this.plugin.settings.apiKey ? 'llm-wiki-status-online' : 'llm-wiki-status-offline'}"></div>
						<span>${this.plugin.settings.apiKey ? 'API ready' : 'API key required'}</span>
					</div>
				</div>
			</div>
			<div class="llm-wiki-meta">
				<span class="llm-wiki-chip">${this.getProviderLabel(this.plugin.settings.aiProvider)}</span>
				<span class="llm-wiki-chip">${this.plugin.settings.model}</span>
				<span class="llm-wiki-chip">Output: ${this.plugin.settings.wikiPath}</span>
			</div>
		`;

		const inputSection = shell.createDiv({ cls: 'llm-wiki-card' });
		inputSection.innerHTML = `
			<div class="llm-wiki-card-header">
				<div>
					<div class="llm-wiki-card-title">Start Ingest</div>
					<p>Supports URLs, local file paths, and quick paste from the clipboard.</p>
				</div>
				<div class="llm-wiki-shortcut">Enter</div>
			</div>
			<div class="llm-wiki-input-surface">
				<div class="llm-wiki-input-row">
					<input type="text" class="llm-wiki-input" placeholder="Enter a URL or file path, for example https://example.com or /Users/me/file.pdf" />
					<button class="llm-wiki-btn-primary" type="button">
						<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<polygon points="5 3 19 12 5 21 5 3"/>
						</svg>
						<span class="llm-wiki-btn-label">Process</span>
					</button>
				</div>
				<div class="llm-wiki-input-actions">
					<button class="llm-wiki-link-btn" type="button" data-action="paste">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
							<rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
						</svg>
						Paste clipboard
					</button>
					<div class="llm-wiki-hints">
						<span class="llm-wiki-hint">Drag files here</span>
						<span class="llm-wiki-hint">Auto-detect URL or file</span>
					</div>
				</div>
			</div>
			${this.plugin.settings.apiKey ? '' : '<div class="llm-wiki-inline-note">No API key is configured yet. Open plugin settings before processing content.</div>'}
		`;

		const outputSection = shell.createDiv({ cls: 'llm-wiki-card llm-wiki-log-card' });
		outputSection.innerHTML = `
			<div class="llm-wiki-card-header">
				<div>
					<div class="llm-wiki-card-title">Activity Log</div>
					<p>This panel shows the full fetch, analysis, and wiki writing workflow.</p>
				</div>
				<div class="llm-wiki-log-pill">Live</div>
			</div>
			<div class="llm-wiki-log"></div>
		`;

		this.inputEl = inputSection.querySelector('.llm-wiki-input') as HTMLInputElement;
		this.processBtn = inputSection.querySelector('.llm-wiki-btn-primary') as HTMLButtonElement;
		this.outputEl = outputSection.querySelector('.llm-wiki-log') as HTMLElement;

		this.renderEmptyState();

		hero.querySelector('[data-action="open-settings"]')?.addEventListener('click', () => this.openPluginSettings());
		this.processBtn.onclick = () => this.handleProcess();
		inputSection.querySelector('[data-action="paste"]')?.addEventListener('click', () => this.pasteFromClipboard());
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
	}

	async onClose() {
		if (this.currentProcess) {
			this.currentProcess.abort();
		}
	}

	async processUrl(url: string) {
		this.inputEl.value = url;
		await this.handleProcess();
	}

	async processFile(file: string) {
		this.inputEl.value = file;
		await this.handleProcess();
	}

	runWikiLint() {
		this.inputEl.value = '';
		this.outputEl.empty();
		this.log('Starting wiki health check...', 'info');

		// Run lint in background
		this.performWikiLint();
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

		} catch (error: any) {
			this.log(`Health check failed: ${error.message}`, 'error');
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
			const summaryMatch = content.match(/## Summary\s*\n\s*[\-\*]*\s*(待补充|TBD|None|\.\.\.)\s*/);
			if (summaryMatch) {
				emptySectionPages.push(file.basename);
				continue;
			}

			// Check for empty Key Points
			const keyPointsMatch = content.match(/## Key Points\s*\n\s*[\-\s]*$/);
			if (keyPointsMatch) {
				emptySectionPages.push(file.basename);
				continue;
			}

			// Check for empty Connections
			const connectionsMatch = content.match(/## Connections\s*\n\s*[\-\s]*None[\-\s]*$/);
			if (connectionsMatch) {
				emptySectionPages.push(file.basename);
			}
		}

		return emptySectionPages;
	}

	private ensureStyles() {
		if (document.getElementById(SidebarView.STYLE_ID)) {
			return;
		}

		const style = document.createElement('style');
		style.id = SidebarView.STYLE_ID;
		style.textContent = `
			.llm-wiki-sidebar {
				height: 100%;
				padding: 18px;
				background: var(--background-primary);
				overflow-y: auto;
			}

			.llm-wiki-shell {
				display: flex;
				flex-direction: column;
				gap: 14px;
				min-height: 100%;
			}

			.llm-wiki-hero,
			.llm-wiki-card {
				border: 1px solid var(--background-modifier-border);
				border-radius: 18px;
				background: var(--background-secondary);
				box-shadow: 0 10px 24px rgba(15, 23, 42, 0.05);
			}

			.llm-wiki-hero {
				padding: 18px;
				background:
					radial-gradient(circle at top right, rgba(99, 102, 241, 0.12), transparent 35%),
					linear-gradient(180deg, var(--background-secondary) 0%, var(--background-primary) 100%);
			}

			.llm-wiki-brand {
				display: flex;
				align-items: flex-start;
				justify-content: space-between;
				gap: 12px;
			}

			.llm-wiki-hero-actions {
				display: flex;
				align-items: center;
				gap: 10px;
				flex-shrink: 0;
				flex-wrap: nowrap;
				white-space: nowrap;
			}

			.llm-wiki-brand-main {
				display: flex;
				align-items: flex-start;
				gap: 14px;
				min-width: 0;
			}

			.llm-wiki-logo {
				width: 46px;
				height: 46px;
				border-radius: 14px;
				display: grid;
				place-items: center;
				flex-shrink: 0;
				color: var(--interactive-accent);
				background: var(--background-primary);
				border: 1px solid var(--background-modifier-border);
			}

			.llm-wiki-eyebrow {
				display: inline-block;
				margin-bottom: 6px;
				font-size: 11px;
				font-weight: 700;
				letter-spacing: 0.08em;
				text-transform: uppercase;
				color: var(--text-accent);
			}

			.llm-wiki-title-text,
			.llm-wiki-card-title {
				margin: 0;
				font-size: 18px;
				font-weight: 700;
				color: var(--text-normal);
			}

			.llm-wiki-title p,
			.llm-wiki-card-header p {
				margin: 6px 0 0;
				font-size: 13px;
				line-height: 1.5;
				color: var(--text-muted);
			}

			.llm-wiki-status {
				display: inline-flex;
				align-items: center;
				gap: 8px;
				padding: 8px 12px;
				border-radius: 999px;
				background: var(--background-primary);
				border: 1px solid var(--background-modifier-border);
				color: var(--text-muted);
				font-size: 12px;
				font-weight: 600;
				flex-shrink: 0;
			}

			.llm-wiki-status-indicator {
				width: 8px;
				height: 8px;
				border-radius: 999px;
			}

			.llm-wiki-status-online {
				background: var(--color-green, #22c55e);
				box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.14);
			}

			.llm-wiki-status-offline {
				background: var(--color-orange, #f59e0b);
				box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.14);
			}

			.llm-wiki-meta {
				display: flex;
				flex-wrap: wrap;
				gap: 8px;
				margin-top: 14px;
			}

			.llm-wiki-chip,
			.llm-wiki-log-pill,
			.llm-wiki-shortcut,
			.llm-wiki-hint {
				display: inline-flex;
				align-items: center;
				justify-content: center;
				padding: 6px 10px;
				border-radius: 999px;
				border: 1px solid var(--background-modifier-border);
				background: var(--background-primary);
				font-size: 12px;
				color: var(--text-muted);
			}

			.llm-wiki-card {
				padding: 16px;
			}

			.llm-wiki-card-header {
				display: flex;
				align-items: flex-start;
				justify-content: space-between;
				gap: 12px;
				margin-bottom: 14px;
			}

			.llm-wiki-input-surface {
				padding: 12px;
				border-radius: 16px;
				border: 1px dashed var(--background-modifier-border);
				background: var(--background-primary);
				transition: border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
			}

			.llm-wiki-input-row {
				display: flex;
				gap: 10px;
				align-items: center;
			}

			.llm-wiki-input {
				flex: 1;
				width: 100%;
				min-width: 0;
				height: 44px;
				padding: 0 14px;
				border: 1px solid transparent;
				border-radius: 12px;
				background: var(--background-secondary);
				color: var(--text-normal);
				font-size: 14px;
				box-shadow: inset 0 0 0 1px var(--background-modifier-border);
				transition: box-shadow 0.2s ease, background 0.2s ease;
			}

			.llm-wiki-input:focus {
				outline: none;
				background: var(--background-primary);
				box-shadow: inset 0 0 0 1px var(--interactive-accent), 0 0 0 3px rgba(99, 102, 241, 0.12);
			}

			.llm-wiki-input::placeholder {
				color: var(--text-faint);
			}

			.llm-wiki-btn-primary,
			.llm-wiki-link-btn,
			.llm-wiki-ghost-btn {
				border: none;
				cursor: pointer;
				transition: transform 0.16s ease, opacity 0.16s ease, background 0.16s ease;
			}

			.llm-wiki-btn-primary {
				height: 44px;
				padding: 0 16px;
				border-radius: 12px;
				display: inline-flex;
				align-items: center;
				gap: 8px;
				background: var(--interactive-accent);
				color: var(--text-on-accent);
				font-size: 13px;
				font-weight: 700;
				white-space: nowrap;
			}

			.llm-wiki-btn-primary:hover:not(:disabled),
			.llm-wiki-link-btn:hover {
				transform: translateY(-1px);
			}

			.llm-wiki-btn-primary:disabled {
				opacity: 0.7;
				cursor: not-allowed;
				transform: none;
			}

			.llm-wiki-btn-primary.is-loading {
				background: var(--interactive-accent-hover);
			}

			.llm-wiki-input-actions {
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: 10px;
				margin-top: 12px;
				flex-wrap: wrap;
			}

			.llm-wiki-link-btn {
				display: inline-flex;
				align-items: center;
				gap: 8px;
				padding: 8px 12px;
				border-radius: 10px;
				background: transparent;
				color: var(--text-normal);
				font-size: 13px;
			}

			.llm-wiki-ghost-btn {
				height: 36px;
				padding: 0 12px;
				display: inline-flex;
				align-items: center;
				gap: 8px;
				border-radius: 999px;
				background: var(--background-primary);
				color: var(--text-normal);
				font-size: 12px;
				font-weight: 600;
				border: 1px solid var(--background-modifier-border);
				white-space: nowrap;
			}

			.llm-wiki-ghost-btn:hover {
				background: var(--background-modifier-hover);
			}

			.llm-wiki-hints {
				display: flex;
				flex-wrap: wrap;
				gap: 8px;
			}

			.llm-wiki-inline-note {
				margin-top: 12px;
				padding: 10px 12px;
				border-radius: 12px;
				background: var(--background-primary);
				border: 1px solid var(--background-modifier-border);
				color: var(--text-muted);
				font-size: 12px;
				line-height: 1.5;
			}

			.llm-wiki-log-card {
				display: flex;
				flex-direction: column;
				flex: 1;
				min-height: 320px;
			}

			.llm-wiki-log {
				flex: 1;
				min-height: 240px;
				max-height: 480px;
				overflow-y: auto;
				padding-right: 2px;
			}

			.llm-wiki-log::-webkit-scrollbar {
				width: 6px;
			}

			.llm-wiki-log::-webkit-scrollbar-thumb {
				background: var(--background-modifier-border);
				border-radius: 999px;
			}

			.llm-wiki-log-empty {
				min-height: 240px;
				display: flex;
				flex-direction: column;
				align-items: center;
				justify-content: center;
				gap: 10px;
				text-align: center;
				padding: 28px 20px;
				border-radius: 16px;
				border: 1px dashed var(--background-modifier-border);
				background: var(--background-primary);
				color: var(--text-muted);
			}

			.llm-wiki-log-empty svg {
				opacity: 0.65;
			}

			.llm-wiki-log-empty h3 {
				margin: 0;
				font-size: 15px;
				color: var(--text-normal);
			}

			.llm-wiki-log-empty p {
				margin: 0;
				font-size: 13px;
				line-height: 1.5;
			}

			.llm-wiki-log-empty-steps {
				display: flex;
				flex-direction: column;
				gap: 6px;
				margin-top: 4px;
				font-size: 12px;
			}

			.llm-wiki-log-line {
				display: grid;
				grid-template-columns: auto minmax(0, 1fr) auto;
				gap: 10px;
				align-items: start;
				padding: 12px 14px;
				margin-bottom: 10px;
				border-radius: 14px;
				border: 1px solid var(--background-modifier-border);
				background: var(--background-primary);
				animation: llm-wiki-fade-up 0.18s ease;
			}

			.llm-wiki-log-badge {
				padding: 4px 8px;
				border-radius: 999px;
				font-size: 11px;
				font-weight: 700;
				letter-spacing: 0.02em;
				background: var(--background-modifier-hover);
				color: var(--text-muted);
			}

			.llm-wiki-log-message {
				font-size: 13px;
				line-height: 1.55;
				color: var(--text-normal);
				word-break: break-word;
				white-space: pre-wrap;
			}

			.llm-wiki-log-time {
				font-size: 11px;
				color: var(--text-faint);
				white-space: nowrap;
				padding-top: 3px;
			}

			.llm-wiki-log-line.llm-wiki-progress .llm-wiki-log-badge {
				background: rgba(59, 130, 246, 0.12);
				color: var(--text-accent);
			}

			.llm-wiki-log-line.llm-wiki-success .llm-wiki-log-badge {
				background: rgba(34, 197, 94, 0.12);
				color: var(--color-green, #16a34a);
			}

			.llm-wiki-log-line.llm-wiki-info .llm-wiki-log-badge {
				background: rgba(148, 163, 184, 0.18);
				color: var(--text-muted);
			}

			.llm-wiki-log-line.llm-wiki-error .llm-wiki-log-badge {
				background: rgba(239, 68, 68, 0.12);
				color: var(--text-error, #dc2626);
			}

			.llm-wiki-artifacts {
				margin-top: 14px;
				padding: 14px;
				border-radius: 16px;
				border: 1px solid var(--background-modifier-border);
				background: var(--background-primary);
				animation: llm-wiki-fade-up 0.18s ease;
			}

			.llm-wiki-artifacts-header {
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: 10px;
				margin-bottom: 12px;
			}

			.llm-wiki-artifacts-title {
				margin: 0;
				font-size: 14px;
				font-weight: 700;
				color: var(--text-normal);
			}

			.llm-wiki-artifacts-note {
				margin: 0;
				font-size: 12px;
				color: var(--text-muted);
			}

			.llm-wiki-artifact-list {
				display: flex;
				flex-direction: column;
				gap: 10px;
			}

			.llm-wiki-artifact-item {
				display: flex;
				align-items: flex-start;
				justify-content: space-between;
				gap: 10px;
				padding: 10px 12px;
				border-radius: 12px;
				border: 1px solid var(--background-modifier-border);
				background: var(--background-secondary);
			}

			.llm-wiki-artifact-main {
				min-width: 0;
			}

			.llm-wiki-artifact-label {
				font-size: 13px;
				font-weight: 600;
				color: var(--text-normal);
				word-break: break-word;
			}

			.llm-wiki-artifact-path,
			.llm-wiki-artifact-description {
				margin-top: 4px;
				font-size: 12px;
				line-height: 1.5;
				color: var(--text-muted);
				word-break: break-word;
			}

			.llm-wiki-artifact-actions {
				display: flex;
				flex-wrap: wrap;
				gap: 8px;
				flex-shrink: 0;
				justify-content: flex-end;
			}

			.llm-wiki-drag-over .llm-wiki-input-surface {
				background: var(--background-modifier-hover);
				border-color: var(--interactive-accent);
				box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
			}

			@keyframes llm-wiki-fade-up {
				from {
					opacity: 0;
					transform: translateY(6px);
				}
				to {
					opacity: 1;
					transform: translateY(0);
				}
			}

			@media (max-width: 520px) {
				.llm-wiki-brand,
				.llm-wiki-input-row,
				.llm-wiki-card-header {
					flex-direction: column;
				}

				.llm-wiki-status,
				.llm-wiki-hero-actions,
				.llm-wiki-shortcut,
				.llm-wiki-log-pill {
					align-self: flex-start;
				}

				.llm-wiki-btn-primary {
					width: 100%;
					justify-content: center;
				}

				.llm-wiki-log-line {
					grid-template-columns: 1fr;
				}

				.llm-wiki-artifact-item {
					flex-direction: column;
				}

				.llm-wiki-artifact-actions {
					width: 100%;
					justify-content: flex-start;
				}

				.llm-wiki-log-time {
					padding-top: 0;
				}
			}
		`;

		document.head.appendChild(style);
	}

	private renderEmptyState() {
		this.outputEl.empty();
		this.outputEl.innerHTML = `
			<div class="llm-wiki-log-empty">
				<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
					<path d="M12 3v18"/>
					<path d="M3 12h18"/>
					<circle cx="12" cy="12" r="9"/>
				</svg>
				<p>Enter a web link or local file path and LLM Wiki will generate structured pages automatically.</p>
				<div class="llm-wiki-log-empty-steps">
					<span>1. Capture the source content</span>
					<span>2. Extract entities and concepts with AI</span>
					<span>3. Write wiki pages, index, and log</span>
				</div>
			</div>
		`;
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
		} catch (error: any) {
			if (error.name !== 'AbortError') {
				const debugArtifacts = this.extractArtifactPathsFromError(error.message);
				if (debugArtifacts.length > 0) {
					this.renderArtifacts('Failure Artifacts', debugArtifacts, 'Debug artifacts were found and can be opened directly.');
				}
				new Notice(`Processing failed: ${error.message}`);
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
			async () => createProcessor('url'),
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
			() => createProcessor('file').extract(filePath),
			(error) => `Failed to read file: ${error.message}`
		);

		if (signal.aborted) {
			throw new Error('Cancelled');
		}

		this.log(`Extracted title: ${content.title}`, 'success');
		this.log(`Content length: ${content.content.length} characters`, 'info');

		await this.generateWiki(content, signal);
	}

	private async generateWiki(content: any, signal: AbortSignal) {
		const provider = createProvider(
			this.plugin.settings.aiProvider,
			this.plugin.settings.apiKey,
			this.plugin.settings.model
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
		this.renderArtifacts('Generated Artifacts', this.buildSuccessArtifacts(writeResult), 'Open the generated files directly or jump to the output folder.');

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
		return text.startsWith('/') ||
		       text.startsWith('./') ||
		       text.startsWith('../') ||
		       /^[a-zA-Z]:/.test(text) || // Windows path
		       text.endsWith('.md') ||
		       text.endsWith('.txt') ||
		       text.endsWith('.pdf');
	}

	private async processTextContent(text: string, signal: AbortSignal) {
		this.log('Processing text content...', 'info');

		const content = {
			type: 'text' as const,
			source: 'clipboard',
			title: 'Clipboard Content',
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
				label: `${this.getArtifactTypeLabel(page.type)} · ${page.operation === 'created' ? 'Created' : 'Updated'}`,
				path: page.path,
				description: page.path,
			}));

		return [
			{
				label: 'Wiki Output Folder',
				path: writeResult.wikiPath,
				description: `Folder: ${writeResult.wikiPath}`,
				isDirectory: true,
			},
			{
				label: `Raw Source Page · ${writeResult.rawOperation === 'created' ? 'Created' : 'Reused'}`,
				path: writeResult.rawPath,
				description: writeResult.rawPath,
			},
			...pageArtifacts,
			{
				label: 'Index Page',
				path: writeResult.indexPath,
				description: writeResult.indexPath,
			},
			{
				label: 'Log Page',
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
				label: 'Debug Folder',
				path: `${this.plugin.settings.wikiPath}/debug`,
				description: `Folder: ${this.plugin.settings.wikiPath}/debug`,
				isDirectory: true,
			},
		];

		uniquePaths.forEach((path, index) => {
			artifacts.push({
				label: `Debug File ${index + 1}`,
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
					text: 'Open File',
					type: 'button',
				});
				openFileBtn.addEventListener('click', () => {
					void this.openArtifactFile(artifact.path);
				});
			}

			const openDirBtn = actions.createEl('button', {
				cls: 'llm-wiki-link-btn',
				text: 'Open Folder',
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
		} catch (error: any) {
			new Notice(`Failed to open folder: ${error.message}`);
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
			return 'Source Page';
		}

		if (type === 'entity') {
			return 'Entity Page';
		}

		return 'Concept Page';
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
		task: () => Promise<T>,
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
		} catch (error: any) {
			const resolvedMessage = errorMessage?.(error) || `Failed: ${error.message}`;
			this.updateLogEntry(line, resolvedMessage, 'error');
			throw error;
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

	private async confirmPrivacyWarning(): Promise<boolean> {
		// Check if user already acknowledged the warning
		if (localStorage.getItem('llm-wiki-privacy-acknowledged') === 'true') {
			return true;
		}

		return new Promise((resolve) => {
			const modal = new PrivacyWarningModal(this.app, this.plugin.settings.aiProvider, (confirmed) => resolve(confirmed));
			modal.open();
		});
	}
}

class PrivacyWarningModal {
	private modalEl: HTMLElement;
	private onSubmit: (confirmed: boolean) => void;

	constructor(app: App, provider: string, onSubmit: (confirmed: boolean) => void) {
		this.onSubmit = onSubmit;

		this.modalEl = document.createElement('div');
		this.modalEl.className = 'modal-container';
		this.modalEl.style.zIndex = '1000';

		const modal = this.modalEl.createEl('div', { cls: 'modal' });
		(modal as HTMLElement).style.maxWidth = '500px';

		const content = modal.createEl('div', { cls: 'modal-content' });

		// Warning icon and title
		const header = content.createEl('div', { cls: 'llm-wiki-privacy-header' });
		header.innerHTML = `
			<div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
				<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2">
					<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
					<line x1="12" y1="9" x2="12" y2="13"/>
					<line x1="12" y1="17" x2="12.01" y2="17"/>
				</svg>
				<h3 style="margin: 0; font-size: 18px; font-weight: 600;">Privacy Notice</h3>
			</div>
		`;

		// Warning message
		const message = content.createEl('div', { cls: 'llm-wiki-privacy-message' });
		message.innerHTML = `
			<p style="margin: 0 0 12px 0; line-height: 1.6; color: var(--text-normal);">
				Your content will be sent to <strong>${provider}</strong> for processing. This means:
			</p>
			<ul style="margin: 0 0 16px 20px; line-height: 1.6; color: var(--text-muted);">
				<li>Your content will be processed by ${provider}'s servers</li>
				<li>Data handling depends on ${provider}'s terms and privacy policy</li>
				<li>Avoid processing sensitive, confidential, or personal information</li>
			</ul>
			<p style="margin: 0 0 16px 0; line-height: 1.6; color: var(--text-normal);">
				<strong>Do you want to continue?</strong>
			</p>
		`;

		// Buttons
		const btnContainer = content.createEl('div', { cls: 'modal-button-container' });

		const cancelBtn = btnContainer.createEl('button', { text: 'Cancel' });
		cancelBtn.style.marginRight = '8px';
		cancelBtn.onclick = () => {
			this.onSubmit(false);
			this.close();
		};

		const confirmBtn = btnContainer.createEl('button', {
			cls: 'mod-cta',
			text: 'Continue'
		});
		confirmBtn.onclick = () => {
			this.onSubmit(true);
			this.close();
		};

		// Add "Don't show again" option
		const footer = content.createEl('div');
		footer.style.marginTop = '16px';
		footer.style.paddingTop = '16px';
		footer.style.borderTop = '1px solid var(--background-modifier-border)';
		const checkbox = footer.createEl('input', { type: 'checkbox' });
		checkbox.id = 'llm-wiki-dont-show-again';
		const label = footer.createEl('label', {
			text: 'Don\'t show this warning again (you understand the risks)'
		});
		label.style.marginLeft = '8px';
		label.style.cursor = 'pointer';
		label.style.color = 'var(--text-muted)';
		label.style.fontSize = '13px';
		label.htmlFor = 'llm-wiki-dont-show-again';

		checkbox.addEventListener('change', () => {
			if (checkbox.checked) {
				localStorage.setItem('llm-wiki-privacy-acknowledged', 'true');
			} else {
				localStorage.removeItem('llm-wiki-privacy-acknowledged');
			}
		});

		// Auto-confirm if already acknowledged
		if (localStorage.getItem('llm-wiki-privacy-acknowledged') === 'true') {
			// Small delay to allow modal to render, then auto-confirm
			setTimeout(() => {
				this.onSubmit(true);
				this.close();
			}, 100);
		}
	}

	open() {
		document.body.appendChild(this.modalEl);
		// Focus the confirm button
		const confirmBtn = this.modalEl.querySelector('.mod-cta') as HTMLButtonElement;
		if (confirmBtn) {
			setTimeout(() => confirmBtn.focus(), 50);
		}
	}

	close() {
		this.modalEl.remove();
	}
}
