import { App, TFile } from 'obsidian';
import { AIProvider } from '../providers';
import { ExtractedContent } from '../processors';
import { DEFAULT_LLM_WIKI_SCHEMA } from './schema';

export interface WikiPage {
	path: string;
	content: string;
	action: 'create' | 'update' | 'skip';
}

export interface WikiGenerationResult {
	rawDocument: {
		path: string;
		content: string;
		action: 'create' | 'skip';
	};
	sourcePage: WikiPage;
	entityPages: WikiPage[];
	conceptPages: WikiPage[];
	indexUpdate: {
		source: string;
		summary: string;
	};
	logEntry: {
		timestamp: string;
		action: string;
		source: string;
		pages: string[];
		description: string;
	};
}

interface PageWriteResult {
	path: string;
	link: string;
	type: 'source' | 'entity' | 'concept';
	operation: 'created' | 'updated' | 'skipped';
}

export interface WikiWriteResult {
	rawPath: string;
	rawOperation: 'created' | 'skipped';
	pages: Array<{
		path: string;
		link: string;
		type: 'source' | 'entity' | 'concept';
		operation: 'created' | 'updated' | 'skipped';
	}>;
	indexPath: string;
	logPath: string;
	wikiPath: string;
}

type ParsedWikiGenerationResult = Partial<WikiGenerationResult> & {
	sourcePage?: Partial<WikiPage>;
	entityPages?: Array<Partial<WikiPage> | null> | Partial<WikiPage> | null;
	conceptPages?: Array<Partial<WikiPage> | null> | Partial<WikiPage> | null;
	indexUpdate?: Partial<WikiGenerationResult['indexUpdate']>;
	logEntry?: Partial<WikiGenerationResult['logEntry']>;
};

export class WikiGenerator {
	private static readonly GENERATION_MAX_ATTEMPTS = 3;
	private static readonly GENERATION_MAX_TOKENS = 8192;
	private static readonly DEBUG_DIR_NAME = 'debug';

	constructor(
		private app: App,
		private provider: AIProvider,
		private wikiPath: string,
		private customSchema?: string
	) {}

	async generate(content: ExtractedContent, onProgress?: (chunk: string) => void): Promise<WikiGenerationResult> {
		const schema = this.customSchema || DEFAULT_LLM_WIKI_SCHEMA;

		// Get existing wiki pages for context
		const existingPages = await this.getExistingPages();

		const systemPrompt = this.buildSystemPrompt(schema);
		const userPrompt = this.buildUserPrompt(content, existingPages);
		let lastError: Error | null = null;

		for (let attempt = 1; attempt <= WikiGenerator.GENERATION_MAX_ATTEMPTS; attempt += 1) {
			try {
				const response = await this.provider.generate(
					this.buildAttemptPrompt(userPrompt, attempt, lastError),
					{
						system: systemPrompt,
						onProgress,
						temperature: attempt === 1 ? 0.2 : 0,
						maxTokens: WikiGenerator.GENERATION_MAX_TOKENS,
					}
				);

				try {
					return this.enrichResult(this.parseResponse(response), content);
				} catch (parseError) {
					const repairedResult = await this.tryRepairMalformedResponse(response, parseError as Error);
					if (repairedResult) {
						return this.enrichResult(repairedResult, content);
					}

					const debugPath = await this.writeDebugArtifact({
						attempt,
						error: parseError as Error,
						systemPrompt,
						userPrompt,
						response,
					});

					lastError = new Error(`${(parseError as Error).message}. The raw response was saved to ${debugPath}`);
				}
			} catch (error) {
				lastError = error as Error;
			}
		}

		throw new Error(`AI result generation failed after ${WikiGenerator.GENERATION_MAX_ATTEMPTS} attempts: ${lastError?.message || 'Unknown error'}`);
	}

	private buildSystemPrompt(schema: string): string {
		return `${schema}

## Output Contract

Follow these rules strictly:
1. Output exactly one JSON object and nothing else: no explanations, no preface, no epilogue, no comments, and no Markdown code fences.
2. Every field name must match the schema exactly. Do not add extra top-level fields.
3. Every \`path\` field must be relative to \`${this.wikiPath}\` and must not include the \`${this.wikiPath}/\` prefix.
4. Every \`content\` field must be a valid JSON string. Preserve Markdown newlines inside the string without breaking JSON syntax.
5. Do not use trailing commas, comments, unclosed brackets, or unescaped double quotes.
6. \`sourcePage\` must include \`path\`, \`content\`, and \`action\`.
7. \`entityPages\` and \`conceptPages\` must always be arrays. Return \`[]\` when there is no content.
8. \`indexUpdate\` must include \`source\` and \`summary\`.
9. \`logEntry\` must include \`timestamp\`, \`action\`, \`source\`, \`pages\`, and \`description\`.
10. The first character of the final answer must be \`{\` and the last character must be \`}\`.
11. Keep the output concise while preserving readability. Only keep high-confidence information and avoid unnecessary verbosity.
12. If information is insufficient, do not elaborate. Prefer fewer pages that are complete and valid.
13. Keep brand names, product names, series names, and model names in their original form. Do not translate, Anglicize, "correct", or rewrite them.
14. WikiLinks inside \`Connections\` and \`References\` must use page basenames only, for example \`[[foo-bar]]\`, without directory prefixes. \`References\` must point to documents under \`raw/\`.`;
	}

	private buildUserPrompt(content: ExtractedContent, existingPages: string[]): string {
		return `## Existing Wiki Pages

${existingPages.length > 0 ? existingPages.map((page) => `- [[${page}]]`).join('\n') : '- (none)'}

## Source Metadata

- Title: ${content.title}
- Author: ${content.author || 'Unknown'}
- Date: ${content.date || 'Unknown'}
- Source: ${content.source}

## Source Content

${content.content}`;
	}

	private buildAttemptPrompt(basePrompt: string, attempt: number, lastError: Error | null): string {
		if (attempt === 1) {
			return basePrompt;
		}

		return `${basePrompt}

## Retry Instructions

The previous output was unusable because: ${lastError?.message || 'Unknown error'}.
Regenerate the full result from scratch and follow these rules strictly:
- Output one complete JSON object only
- Do not output Markdown code fences
- Do not omit closing braces or array terminators
- Do not truncate the content
- If some pages are uncertain, return empty arrays instead of partial JSON
- Keep the output more compact and prioritize \`sourcePage\` plus high-confidence pages
- Return at most 3 \`entityPages\` and at most 3 \`conceptPages\``;
	}

	private async tryRepairMalformedResponse(response: string, parseError: Error): Promise<WikiGenerationResult | null> {
		try {
			const repaired = await this.provider.generate(this.buildRepairPrompt(response, parseError), {
				system: this.buildRepairSystemPrompt(),
				temperature: 0,
				maxTokens: WikiGenerator.GENERATION_MAX_TOKENS,
			});
			return this.parseResponse(repaired);
		} catch {
			return null;
		}
	}

	private buildRepairSystemPrompt(): string {
		return `You are a JSON repair assistant.

Your task is to repair the malformed output provided by the user into one valid, complete JSON object.
Output only the repaired JSON object and nothing else.
If an array field is missing, fill it with [].
If a string field is missing, infer the shortest reasonable value from the available content when possible.
Do not output Markdown code fences.`;
	}

	private buildRepairPrompt(response: string, parseError: Error): string {
		return `Below is a malformed model output. The current parse error is: ${parseError.message}

Repair it into one complete, valid JSON object while preserving the original field structure.

Malformed output starts
${response}
Malformed output ends`;
	}

	private async writeDebugArtifact(params: {
		attempt: number;
		error: Error;
		systemPrompt: string;
		userPrompt: string;
		response: string;
	}): Promise<string> {
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
		const debugDir = `${this.wikiPath}/${WikiGenerator.DEBUG_DIR_NAME}`;
		const debugPath = `${debugDir}/llm-response-${timestamp}-attempt-${params.attempt}.txt`;
		const debugContent = [
			'# LLM Wiki Debug Artifact',
			'',
			`provider: ${this.provider.name}`,
			`attempt: ${params.attempt}`,
			`error: ${params.error.message}`,
			`createdAt: ${new Date().toISOString()}`,
			'',
			'## System Prompt',
			params.systemPrompt,
			'',
			'## User Prompt',
			params.userPrompt,
			'',
			'## Raw Response',
			params.response,
			'',
		].join('\n');

		await this.ensureFolder(debugDir);
		await this.app.vault.create(debugPath, debugContent);
		return debugPath;
	}

	private async ensureFolder(path: string): Promise<void> {
		const normalizedPath = path.replace(/\/+$/g, '');
		if (!normalizedPath) {
			return;
		}

		const parts = normalizedPath.split('/');
		let currentPath = '';

		for (const part of parts) {
			currentPath = currentPath ? `${currentPath}/${part}` : part;
			if (!this.app.vault.getAbstractFileByPath(currentPath)) {
				await this.app.vault.createFolder(currentPath);
			}
		}
	}

	private parseResponse(response: string): WikiGenerationResult {
		const jsonCandidate = this.extractJsonCandidate(response);
		const parsed = this.parseJsonWithRecovery(jsonCandidate);
		return this.normalizeResult(parsed);
	}

	private extractJsonCandidate(response: string): string {
		const fencedMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
		const source = fencedMatch?.[1] || response;
		const trimmed = source.trim().replace(/^\uFEFF/, '');

		const firstBrace = trimmed.indexOf('{');
		if (firstBrace === -1) {
			throw new Error('No JSON object was found in the AI response.');
		}

		let depth = 0;
		let inString = false;
		let isEscaped = false;

		for (let index = firstBrace; index < trimmed.length; index += 1) {
			const char = trimmed[index];

			if (inString) {
				if (isEscaped) {
					isEscaped = false;
					continue;
				}

				if (char === '\\') {
					isEscaped = true;
					continue;
				}

				if (char === '"') {
					inString = false;
				}
				continue;
			}

			if (char === '"') {
				inString = true;
				continue;
			}

			if (char === '{') {
				depth += 1;
			} else if (char === '}') {
				depth -= 1;
				if (depth === 0) {
					return trimmed.slice(firstBrace, index + 1);
				}
			}
		}

		throw new Error('The JSON object in the AI response is incomplete.');
	}

	private parseJsonWithRecovery(jsonCandidate: string): ParsedWikiGenerationResult {
		const attempts = [
			jsonCandidate,
			this.sanitizeJsonCandidate(jsonCandidate),
		];

		let lastError: Error | null = null;

		for (const attempt of attempts) {
			try {
				return JSON.parse(attempt) as ParsedWikiGenerationResult;
			} catch (error) {
				lastError = error as Error;
			}
		}

		throw new Error(`The AI response is not valid JSON: ${lastError?.message || 'unknown error'}`);
	}

	private sanitizeJsonCandidate(jsonCandidate: string): string {
		return jsonCandidate
			.trim()
			.replace(/^\uFEFF/, '')
			.replace(/,\s*([}\]])/g, '$1');
	}

	private enrichResult(result: WikiGenerationResult, content: ExtractedContent): WikiGenerationResult {
		const today = new Date().toISOString().slice(0, 10);
		const rawDocument = this.buildRawDocument(content, today);
		const sourcePage = this.alignSourcePagePath(
			this.ensurePageDirectory(result.sourcePage, 'sources'),
			rawDocument.path
		);
		const entityPages = result.entityPages.map((page) => this.ensurePageDirectory(page, 'entities'));
		const conceptPages = result.conceptPages.map((page) => this.ensurePageDirectory(page, 'concepts'));

		const pageInfos = [
			{ path: sourcePage.path, title: this.extractPageTitle(sourcePage.content, sourcePage.path), type: 'source' as const },
			...entityPages.map((page) => ({ path: page.path, title: this.extractPageTitle(page.content, page.path), type: 'entity' as const })),
			...conceptPages.map((page) => ({ path: page.path, title: this.extractPageTitle(page.content, page.path), type: 'concept' as const })),
		];
		const rawReference = rawDocument.path;

		return {
			rawDocument,
			sourcePage: {
				...sourcePage,
				content: this.rewritePageContent(sourcePage.content, {
					pageType: 'source',
					pagePath: sourcePage.path,
					title: this.extractPageTitle(sourcePage.content, sourcePage.path),
					today,
					sourceReference: rawReference,
					connections: pageInfos
						.filter((page) => page.path !== sourcePage.path)
						.map((page) => this.toWikiLinkTarget(page.path)),
				}),
			},
			entityPages: entityPages.map((page) => ({
				...page,
				content: this.rewritePageContent(page.content, {
					pageType: 'entity',
					pagePath: page.path,
					title: this.extractPageTitle(page.content, page.path),
					today,
					sourceReference: rawReference,
					connections: this.buildRelatedLinks(page.path, page.content, pageInfos, sourcePage.path),
				}),
			})),
			conceptPages: conceptPages.map((page) => ({
				...page,
				content: this.rewritePageContent(page.content, {
					pageType: 'concept',
					pagePath: page.path,
					title: this.extractPageTitle(page.content, page.path),
					today,
					sourceReference: rawReference,
					connections: this.buildRelatedLinks(page.path, page.content, pageInfos, sourcePage.path),
				}),
			})),
			indexUpdate: {
				source: this.normalizeLinkPath(sourcePage.path),
				summary: result.indexUpdate.summary,
			},
			logEntry: {
				...result.logEntry,
				timestamp: today,
				source: rawDocument.path,
				description: result.logEntry.description || result.indexUpdate.summary,
			},
		};
	}

	private normalizeResult(raw: ParsedWikiGenerationResult): WikiGenerationResult {
		if (!raw || typeof raw !== 'object') {
			throw new Error('The AI response is not an object.');
		}

		const sourcePage = this.normalizePage(raw.sourcePage, 'sourcePage');
		const entityPages = this.normalizePages(raw.entityPages, 'entityPages');
		const conceptPages = this.normalizePages(raw.conceptPages, 'conceptPages');

		return {
			rawDocument: {
				path: '',
				content: '',
				action: 'skip',
			},
			sourcePage,
			entityPages,
			conceptPages,
			indexUpdate: {
				source: this.normalizeLinkPath(raw.indexUpdate?.source || sourcePage.path),
				summary: this.requireString(raw.indexUpdate?.summary, 'indexUpdate.summary'),
			},
			logEntry: {
				timestamp: this.normalizeDate(raw.logEntry?.timestamp),
				action: this.requireString(raw.logEntry?.action || 'ingest', 'logEntry.action'),
				source: this.requireString(raw.logEntry?.source || sourcePage.path, 'logEntry.source'),
				pages: this.normalizeStringArray(
					raw.logEntry?.pages,
					'logEntry.pages',
					this.buildDefaultLogPages(sourcePage, entityPages, conceptPages)
				),
				description: this.requireString(
					raw.logEntry?.description || raw.indexUpdate?.summary || this.extractPageTitle(sourcePage.content, sourcePage.path),
					'logEntry.description'
				),
			},
		};
	}

	private normalizePages(
		rawPages: ParsedWikiGenerationResult['entityPages'] | ParsedWikiGenerationResult['conceptPages'],
		fieldName: 'entityPages' | 'conceptPages'
	): WikiPage[] {
		if (rawPages == null) {
			return [];
		}

		const pages = Array.isArray(rawPages) ? rawPages : [rawPages];
		const normalizedPages: WikiPage[] = [];

		pages.forEach((page, index) => {
			if (page != null) {
				normalizedPages.push(this.normalizePage(page, `${fieldName}[${index}]`));
			}
		});

		return normalizedPages;
	}

	private normalizePage(rawPage: Partial<WikiPage> | undefined, fieldName: string): WikiPage {
		if (!rawPage || typeof rawPage !== 'object') {
			throw new Error(`${fieldName} is missing a valid object.`);
		}

		const rawAction = rawPage.action || 'create';
		if (rawAction !== 'create' && rawAction !== 'update' && rawAction !== 'skip') {
			throw new Error(`${fieldName}.action must be create, update, or skip.`);
		}

		return {
			path: this.normalizePagePath(this.requireString(rawPage.path, `${fieldName}.path`)),
			content: this.requireString(rawPage.content, `${fieldName}.content`),
			action: rawAction,
		};
	}

	private normalizePagePath(path: string): string {
		const normalizedPath = path
			.trim()
			.replace(/\\/g, '/')
			.replace(/^\.?\//, '');

		if (!normalizedPath) {
			throw new Error('path cannot be empty.');
		}

		if (normalizedPath.startsWith(`${this.wikiPath}/`)) {
			return normalizedPath.slice(this.wikiPath.length + 1);
		}

		return normalizedPath;
	}

	private normalizeLinkPath(path: string): string {
		// For wiki links, keep the wiki/ prefix to use absolute paths from vault root
		const normalized = path.replace(/\\/g, '/').replace(/^\.?\//, '');

		// If path doesn't start with wikiPath, add it
		if (!normalized.startsWith(`${this.wikiPath}/`)) {
			return `${this.wikiPath}/${normalized.replace(/\.md$/i, '')}`;
		}

		return normalized.replace(/\.md$/i, '');
	}

	private getRawRootPath(): string {
		const normalizedWikiPath = this.wikiPath.replace(/\/+$/g, '');
		if (!normalizedWikiPath) {
			return 'raw';
		}
		return `${normalizedWikiPath}/raw`;
	}

	private getVaultBasePath(): string | null {
		const basePath = (this.app.vault.adapter as { basePath?: string }).basePath;
		return typeof basePath === 'string' && basePath.trim() ? basePath : null;
	}

	private toVaultRelativePath(path: string): string | null {
		if (!path) {
			return null;
		}

		const normalized = path.replace(/\\/g, '/').trim();
		const basePath = this.getVaultBasePath()?.replace(/\\/g, '/').replace(/\/+$/g, '');
		if (basePath && normalized.startsWith(`${basePath}/`)) {
			return normalized.slice(basePath.length + 1);
		}

		return normalized.startsWith('/') ? null : normalized.replace(/^\.?\//, '');
	}

	private alignSourcePagePath(page: WikiPage, rawPath: string): WikiPage {
		const basename = rawPath.split('/').pop() || 'source.md';
		return {
			...page,
			path: `sources/${basename}`,
		};
	}

	private buildRawDocument(
		content: ExtractedContent,
		today: string
	): WikiGenerationResult['rawDocument'] {
		const existingRawPath = this.resolveExistingRawPath(content.source);
		if (existingRawPath) {
			return {
				path: existingRawPath,
				content: '',
				action: 'skip',
			};
		}

		const rawPath = this.buildRawPath(content, today);
		if (this.app.vault.getAbstractFileByPath(rawPath)) {
			return {
				path: rawPath,
				content: '',
				action: 'skip',
			};
		}

		return {
			path: rawPath,
			content: this.buildRawContent(content, today),
			action: 'create',
		};
	}

	private resolveExistingRawPath(source: string): string | null {
		const relativePath = this.toVaultRelativePath(source);
		if (!relativePath) {
			return null;
		}

		const normalized = relativePath.replace(/^\.?\//, '');
		return normalized.startsWith(`${this.getRawRootPath()}/`) && normalized.endsWith('.md')
			? normalized
			: null;
	}

	private buildRawPath(content: ExtractedContent, today: string): string {
		const rawRoot = this.getRawRootPath();
		const sourceRelativePath = this.toVaultRelativePath(content.source);
		const sourceBasename = content.source.split('/').pop()?.replace(/\.[^.]+$/u, '') || '';
		const sourceSlug =
			this.slugify(content.title) ||
			this.slugify(sourceBasename) ||
			(sourceRelativePath ? this.slugify(sourceRelativePath) : '') ||
			`source-${this.hashString(content.source).slice(0, 8)}`;

		return `${rawRoot}/${today}-${sourceSlug}.md`;
	}

	private buildRawContent(content: ExtractedContent, today: string): string {
		const metadataLines = [
			'---',
			'type: raw',
			`created: ${today}`,
			`modified: ${today}`,
			`source: "${this.escapeYamlValue(content.source)}"`,
			`title: "${this.escapeYamlValue(content.title)}"`,
		];

		if (content.author) {
			metadataLines.push(`author: "${this.escapeYamlValue(content.author)}"`);
		}

		if (content.date) {
			metadataLines.push(`date: "${this.escapeYamlValue(content.date)}"`);
		}

		metadataLines.push('---');

		return [
			...metadataLines,
			'',
			`# ${content.title}`,
			'',
			'## Source',
			'',
			`- Original: ${content.source}`,
			...(content.author ? [`- Author: ${content.author}`] : []),
			...(content.date ? [`- Date: ${content.date}`] : []),
			'',
			'## Content',
			'',
			content.content.trim(),
			'',
		].join('\n');
	}

	private slugify(value: string): string {
		const ascii = value
			.normalize('NFKD')
			.replace(/[\u0300-\u036f]/g, '')
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '');

		return ascii.slice(0, 80);
	}

	private hashString(value: string): string {
		let hash = 0;
		for (let index = 0; index < value.length; index += 1) {
			hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
		}

		return hash.toString(16);
	}

	private escapeYamlValue(value: string): string {
		return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
	}

	private ensurePageDirectory(page: WikiPage, directory: 'sources' | 'entities' | 'concepts'): WikiPage {
		const normalizedPath = this.normalizePagePath(page.path);
		if (normalizedPath.startsWith(`${directory}/`)) {
			return { ...page, path: normalizedPath };
		}

		return {
			...page,
			path: `${directory}/${normalizedPath.split('/').pop() || normalizedPath}`,
		};
	}

	private extractPageTitle(content: string, fallbackPath: string): string {
		const match = content.match(/^#\s+(.+)$/m);
		if (match?.[1]?.trim()) {
			return match[1].trim();
		}

		return this.pathToWikiLink(fallbackPath);
	}

	private rewritePageContent(
		content: string,
		options: {
			pageType: 'source' | 'entity' | 'concept';
			pagePath: string;
			title: string;
			today: string;
			sourceReference: string;
			connections: string[];
		}
	): string {
		const bodyWithoutFrontmatter = content.replace(/^---[\s\S]*?---\s*/m, '').trim();
		const titleLine = bodyWithoutFrontmatter.match(/^#\s+.+$/m)?.[0] || `# ${options.title}`;
		const bodyWithoutTitle = bodyWithoutFrontmatter.replace(/^#\s+.+$\n*/m, '').trim();
		const tags = this.extractTags(content, options.pageType);
		const rawWikiLink = `[[${this.normalizeLinkPath(options.sourceReference)}]]`;
		const frontmatter = [
			'---',
			`type: ${options.pageType}`,
			`created: ${options.today}`,
			`modified: ${options.today}`,
			'sources:',
			`  - ${rawWikiLink}`,
			`tags: [${tags.join(', ')}]`,
			'---',
		].join('\n');
		const summaryBody =
			this.extractSectionBody(bodyWithoutTitle, 'Summary') ||
			this.extractFirstParagraph(bodyWithoutTitle) ||
			'Summary pending.';
		const keyPointsBody = this.extractListSection(bodyWithoutTitle, 'Key Points') || '- Pending';

		const connectionLines = options.connections.length
			? options.connections.map((link) => `- [[${link}]]`).join('\n')
			: '- None';
		const referenceLines = `- Source: ${rawWikiLink}`;

		let normalizedBody = this.upsertSection(bodyWithoutTitle, 'Summary', summaryBody);
		normalizedBody = this.upsertSection(normalizedBody, 'Key Points', keyPointsBody);
		normalizedBody = this.upsertSection(normalizedBody, 'Connections', connectionLines);
		normalizedBody = this.upsertSection(normalizedBody, 'References', referenceLines);

		return `${frontmatter}\n\n${titleLine}\n\n${normalizedBody.trim()}\n`;
	}

	private extractTags(content: string, pageType: 'source' | 'entity' | 'concept'): string[] {
		const frontmatter = content.match(/^---\n([\s\S]*?)\n---/);
		const tagLine = frontmatter?.[1]
			.split('\n')
			.find((line) => line.trim().startsWith('tags:'));
		const tags = tagLine
			? tagLine
					.replace(/^tags:\s*/, '')
					.replace(/^\[/, '')
					.replace(/\]$/, '')
					.split(',')
					.map((tag) => tag.trim())
					.filter(Boolean)
			: [];

		if (!tags.length) {
			return [pageType];
		}

		return [...new Set(tags)];
	}

	private extractSectionBody(content: string, heading: string): string {
		const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const match = content.match(new RegExp(`## ${escapedHeading}\\n([\\s\\S]*?)(?=\\n## |$)`, 'm'));
		return match?.[1]?.trim() || '';
	}

	private extractListSection(content: string, heading: string): string {
		const sectionBody = this.extractSectionBody(content, heading);
		if (!sectionBody) {
			return '';
		}

		const lines = sectionBody
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => /^[-*]\s+/.test(line));

		return lines.join('\n');
	}

	private extractFirstParagraph(content: string): string {
		return content
			.replace(/^##\s+.+$/gm, '')
			.split(/\n{2,}/)
			.map((block) => block.trim())
			.find((block) => block && !block.startsWith('-') && !block.startsWith('*'))
			|| '';
	}

	private upsertSection(content: string, heading: string, sectionBody: string): string {
		const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const sectionRegex = new RegExp(`## ${escapedHeading}\\n[\\s\\S]*?(?=\\n## |$)`, 'm');
		const nextSection = `## ${heading}\n${sectionBody}`;

		if (sectionRegex.test(content)) {
			return content.replace(sectionRegex, nextSection).trim();
		}

		return `${content.trim()}\n\n${nextSection}`.trim();
	}

	private buildRelatedLinks(
		pagePath: string,
		pageContent: string,
		pageInfos: Array<{ path: string; title: string; type: 'source' | 'entity' | 'concept' }>,
		sourcePath: string
	): string[] {
		const normalizedContent = this.normalizeTextForMatching(pageContent);
		const related = pageInfos
			.filter((page) => page.path !== pagePath && page.type !== 'source')
			.filter((page) => normalizedContent.includes(this.normalizeTextForMatching(page.title)))
			.map((page) => this.toWikiLinkTarget(page.path));

		return [...new Set([this.toWikiLinkTarget(sourcePath), ...related])];
	}

	private normalizeTextForMatching(value: string): string {
		return value.toLowerCase().replace(/[\s\-_./[\]()]+/g, '');
	}

	private pathToWikiLink(path: string): string {
		// Return the full wiki path with wiki/ prefix for correct linking
		return this.normalizeLinkPath(path);
	}

	private toWikiLinkTarget(path: string): string {
		return this.pathToWikiLink(path);
	}

	private normalizeDate(value: unknown): string {
		if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
			return value.trim();
		}

		return new Date().toISOString().slice(0, 10);
	}

	private normalizeStringArray(value: unknown, fieldName: string, fallback: string[] = []): string[] {
		if (value == null) {
			return fallback;
		}

		if (!Array.isArray(value)) {
			throw new Error(`${fieldName} must be an array of strings.`);
		}

		return value
			.filter((item): item is string => typeof item === 'string')
			.map((item) => item.trim())
			.filter(Boolean);
	}

	private requireString(value: unknown, fieldName: string): string {
		if (typeof value !== 'string' || !value.trim()) {
			throw new Error(`${fieldName} must be a non-empty string.`);
		}

		return value.trim();
	}

	private buildDefaultLogPages(sourcePage: WikiPage, entityPages: WikiPage[], conceptPages: WikiPage[]): string[] {
		return [sourcePage, ...entityPages, ...conceptPages]
			.filter((page) => page.action !== 'skip')
			.map((page) => `${page.action}: ${page.path}`);
	}

	private async getExistingPages(): Promise<string[]> {
		return this.app.vault
			.getMarkdownFiles()
			.filter((file) => file.path.startsWith(`${this.wikiPath}/`) && !/\/(index|log)\.md$/i.test(file.path))
			.map((file) => file.basename)
			.sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
	}

	private async buildIndexContent(update: WikiGenerationResult['indexUpdate']): Promise<string> {
		const files = this.app.vault
			.getMarkdownFiles()
			.filter((file) => file.path.startsWith(`${this.wikiPath}/`))
			.filter((file) => !file.path.startsWith(`${this.wikiPath}/${WikiGenerator.DEBUG_DIR_NAME}/`))
			.filter((file) => !['index.md', 'log.md'].includes(file.name));
		const sources = files.filter((file) => file.path.startsWith(`${this.wikiPath}/sources/`));
		const entities = files.filter((file) => file.path.startsWith(`${this.wikiPath}/entities/`));
		const concepts = files.filter((file) => file.path.startsWith(`${this.wikiPath}/concepts/`));
		const synthesis = files.filter((file) => file.path.startsWith(`${this.wikiPath}/synthesis/`));

		const sourceLines = await Promise.all(
			sources
				.sort((a, b) => a.basename.localeCompare(b.basename, 'zh-Hans-CN'))
				.map(async (file) => {
					const summary =
						this.normalizeLinkPath(file.path) === update.source
							? update.summary
							: this.extractSummary(await this.app.vault.read(file));
					return summary ? `- [[${file.basename}]] - ${summary}` : `- [[${file.basename}]]`;
				})
		);
		const entityLines = entities
			.sort((a, b) => a.basename.localeCompare(b.basename, 'zh-Hans-CN'))
			.map((file) => `- [[${file.basename}]]`);
		const conceptLines = concepts
			.sort((a, b) => a.basename.localeCompare(b.basename, 'zh-Hans-CN'))
			.map((file) => `- [[${file.basename}]]`);
		const synthesisLines = synthesis
			.sort((a, b) => a.basename.localeCompare(b.basename, 'zh-Hans-CN'))
			.map((file) => `- [[${file.basename}]]`);
		const totalPages = files.length;
		const today = new Date().toISOString().slice(0, 10);

		return [
			'# Wiki Index',
			'',
			'Content catalog of the knowledge base. Updated automatically on each ingest.',
			'',
			'## Sources',
			'',
			sourceLines.length ? sourceLines.join('\n') : '*Summary pages for raw documents*',
			'',
			'## Entities',
			'',
			entityLines.length ? entityLines.join('\n') : '*People, organizations, technologies*',
			'',
			'## Concepts',
			'',
			conceptLines.length ? conceptLines.join('\n') : '*Ideas, frameworks, mental models*',
			'',
			'## Synthesis',
			'',
			synthesisLines.length ? synthesisLines.join('\n') : '*Cross-source analysis and comparisons*',
			'',
			'---',
			'',
			`**Last updated**: ${today}`,
			`**Total pages**: ${totalPages}`,
			'',
		].join('\n');
	}

	private extractSummary(content: string): string {
		const match = content.match(/## Summary\s+([\s\S]*?)(?=\n## |\n# |$)/m);
		if (!match?.[1]) {
			return '';
		}

		return match[1]
			.trim()
			.split('\n')
			.map((line) => line.replace(/^[-*\s]+/, '').trim())
			.find(Boolean) || '';
	}

	private renderLogEntry(entry: WikiGenerationResult['logEntry'], writes: PageWriteResult[]): string {
		const created = writes.filter((item) => item.operation === 'created').map((item) => `[[${item.link}]]`);
		const updated = writes.filter((item) => item.operation === 'updated').map((item) => `[[${item.link}]]`);

		return [
			`## [${entry.timestamp}] ${entry.action} | ${entry.description}`,
			'',
			`**Source**: [[${this.normalizeLinkPath(entry.source)}]]`,
			`**Created**: ${created.length ? created.join(', ') : '-'}`,
			`**Updated**: ${updated.length ? updated.join(', ') : '-'}`,
		].join('\n');
	}

	async writePages(result: WikiGenerationResult): Promise<WikiWriteResult> {
		const writes: PageWriteResult[] = [];
		await this.writeRawDocument(result.rawDocument);
		writes.push(await this.writePage(result.sourcePage, 'source'));

		for (const page of result.entityPages) {
			writes.push(await this.writePage(page, 'entity'));
		}

		for (const page of result.conceptPages) {
			writes.push(await this.writePage(page, 'concept'));
		}

		await this.updateBidirectionalConnections(writes);
		await this.updateIndex(result.indexUpdate);
		await this.updateLog(result.logEntry, writes);

		return {
			rawPath: result.rawDocument.path,
			rawOperation: result.rawDocument.action === 'create' ? 'created' : 'skipped',
			pages: writes,
			indexPath: `${this.wikiPath}/index.md`,
			logPath: `${this.wikiPath}/log.md`,
			wikiPath: this.wikiPath,
		};
	}

	private async writeRawDocument(rawDocument: WikiGenerationResult['rawDocument']): Promise<void> {
		if (rawDocument.action !== 'create') {
			return;
		}

		const existingFile = this.app.vault.getAbstractFileByPath(rawDocument.path) as TFile;
		const directory = rawDocument.path.split('/').slice(0, -1).join('/');
		if (directory && !this.app.vault.getAbstractFileByPath(directory)) {
			await this.ensureFolder(directory);
		}

		if (existingFile) {
			return;
		}

		await this.app.vault.create(rawDocument.path, rawDocument.content);
	}

	private async writePage(page: WikiPage, type: PageWriteResult['type']): Promise<PageWriteResult> {
		if (page.action === 'skip') {
			return {
				path: page.path,
				link: this.pathToWikiLink(page.path),
				type,
				operation: 'skipped',
			};
		}

		const path = `${this.wikiPath}/${page.path}`;
		const existingFile = this.app.vault.getAbstractFileByPath(path) as TFile;
		const directory = path.split('/').slice(0, -1).join('/');

		if (!this.app.vault.getAbstractFileByPath(directory)) {
			await this.ensureFolder(directory);
		}

		let operation: PageWriteResult['operation'] = 'created';

		if (existingFile) {
			const previousContent = await this.app.vault.read(existingFile);
			await this.app.vault.modify(existingFile, this.preserveFrontmatterDates(previousContent, page.content));
			operation = 'updated';
		} else {
			await this.app.vault.create(path, page.content);
		}

		return {
			path: page.path,
			link: this.pathToWikiLink(page.path),
			type,
			operation,
		};
	}

	private preserveFrontmatterDates(previousContent: string, nextContent: string): string {
		const created = previousContent.match(/^created:\s*(.+)$/m)?.[1]?.trim();
		if (!created) {
			return nextContent;
		}

		return nextContent.replace(/^created:\s*.+$/m, `created: ${created}`);
	}

	private async updateBidirectionalConnections(writes: PageWriteResult[]): Promise<void> {
		const wikiFiles = this.app.vault
			.getMarkdownFiles()
			.filter((file) => file.path.startsWith(`${this.wikiPath}/`))
			.filter((file) => !file.path.startsWith(`${this.wikiPath}/${WikiGenerator.DEBUG_DIR_NAME}/`))
			.filter((file) => !['index.md', 'log.md'].includes(file.name));
		const pathByLink = new Map<string, string>(
			wikiFiles.map((file) => [file.basename, file.path.slice(this.wikiPath.length + 1)])
		);

		for (const write of writes) {
			if (write.operation === 'skipped') {
				continue;
			}

			const sourcePath = `${this.wikiPath}/${write.path}`;
			const sourceFile = this.app.vault.getAbstractFileByPath(sourcePath) as TFile;
			if (!sourceFile) {
				continue;
			}

			// Use MetadataCache to get links more reliably
			const metadata = this.app.metadataCache.getFileCache(sourceFile);
			const connectionLinks = this.extractLinksFromConnectionsSection(await this.app.vault.read(sourceFile));

			for (const connectionLink of connectionLinks) {
				const targetRelativePath = pathByLink.get(connectionLink);
				if (!targetRelativePath || targetRelativePath === write.path) {
					continue;
				}

				const targetFile = this.app.vault.getAbstractFileByPath(`${this.wikiPath}/${targetRelativePath}`) as TFile;
				if (!targetFile) {
					continue;
				}

				const targetContent = await this.app.vault.read(targetFile);
				const existingLinks = this.extractLinksFromConnectionsSection(targetContent);
				if (existingLinks.includes(write.link)) {
					continue;
				}

				const nextConnections = [...new Set([...existingLinks, write.link])]
					.sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'))
					.map((link) => `- [[${link}]]`)
					.join('\n');
				const nextContent = this.upsertSection(targetContent, 'Connections', nextConnections || '- None');
				if (nextContent !== targetContent) {
					await this.app.vault.modify(targetFile, nextContent.endsWith('\n') ? nextContent : `${nextContent}\n`);
				}
			}
		}
	}

	/**
	 * Extract wiki links specifically from the Connections section.
	 * This is more targeted than using MetadataCache which gets all links in the document.
	 */
	private extractLinksFromConnectionsSection(content: string): string[] {
		const sectionBody = this.extractSectionBody(content, 'Connections');
		if (!sectionBody) {
			return [];
		}

		// Only extract links that are list items in the Connections section
		const lines = sectionBody.split('\n');
		const links: string[] = [];

		for (const line of lines) {
			// Match list items with wiki links: - [[Page Name]] or - [[Page|Alias]]
			const match = line.match(/^[\s]*[\-\*]\s*\[\[([^\]|#]+)(?:#[^[\]]+)?(?:\|[^\]]+)?\]\]/);
			if (match) {
				links.push(match[1].trim());
			}
		}

		return links;
	}

	private async updateIndex(update: WikiGenerationResult['indexUpdate']): Promise<void> {
		const indexPath = `${this.wikiPath}/index.md`;
		const existingFile = this.app.vault.getAbstractFileByPath(indexPath) as TFile;
		const content = await this.buildIndexContent(update);

		if (existingFile) {
			await this.app.vault.modify(existingFile, content);
		} else {
			await this.app.vault.create(indexPath, content);
		}
	}

	private async updateLog(entry: WikiGenerationResult['logEntry'], writes: PageWriteResult[]): Promise<void> {
		const logPath = `${this.wikiPath}/log.md`;
		const existingFile = this.app.vault.getAbstractFileByPath(logPath) as TFile;
		const previousContent = existingFile ? await this.app.vault.read(existingFile) : '';
		const bodyWithoutHeading = previousContent.replace(/^# Wiki Log\s*/, '').trim();
		const logEntry = this.renderLogEntry(entry, writes);
		const nextContent = ['# Wiki Log', '', bodyWithoutHeading, logEntry]
			.filter(Boolean)
			.join('\n\n')
			.trimEnd() + '\n';

		if (existingFile) {
			await this.app.vault.modify(existingFile, nextContent);
		} else {
			await this.app.vault.create(logPath, nextContent);
		}
	}
}
