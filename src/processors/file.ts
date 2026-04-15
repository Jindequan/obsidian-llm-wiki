import { ContentProcessor, ExtractedContent } from './base';
import { pdfToMarkdown } from '../parsers/pdf-parse';
import { readLocalTextFile } from '../utils/desktop';

export class FileProcessor implements ContentProcessor {
	type = 'file' as const;

	async extract(filePath: string): Promise<ExtractedContent> {
		const ext = filePath.split('.').pop()?.toLowerCase();

		switch (ext) {
			case 'pdf':
				return this.extractPDF(filePath);
			case 'md':
			case 'markdown':
				return this.extractMarkdown(filePath);
			case 'txt':
				return this.extractText(filePath);
			default:
				throw new Error(`Unsupported file type: ${ext}`);
		}
	}

	private async extractPDF(filePath: string): Promise<ExtractedContent> {
		const { title, content } = await pdfToMarkdown(filePath);

		return {
			type: 'file',
			source: filePath,
			title,
			content,
			metadata: {
				extractedAt: new Date().toISOString(),
				wordCount: content.split(/\s+/).length,
				format: 'pdf',
			},
		};
	}

	private extractMarkdown(filePath: string): ExtractedContent {
		const content = readLocalTextFile(filePath);

		// Extract title from first heading or filename
		const titleMatch = content.match(/^#\s+(.+)$/m);
		const title = titleMatch?.[1] || filePath.split('/').pop() || 'Untitled';

		return {
			type: 'file',
			source: filePath,
			title,
			content,
			metadata: {
				extractedAt: new Date().toISOString(),
				wordCount: content.split(/\s+/).length,
				format: 'markdown',
			},
		};
	}

	private extractText(filePath: string): ExtractedContent {
		const content = readLocalTextFile(filePath);
		const title = filePath.split('/').pop() || 'Untitled';

		return {
			type: 'file',
			source: filePath,
			title,
			content,
			metadata: {
				extractedAt: new Date().toISOString(),
				wordCount: content.split(/\s+/).length,
				format: 'text',
			},
		};
	}
}
