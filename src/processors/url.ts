import { ContentProcessor, ExtractedContent } from './base';
import { urlToMarkdown } from '../parsers/html-to-md';

export class URLProcessor implements ContentProcessor {
	type = 'url' as const;

	async extract(url: string): Promise<ExtractedContent> {
		const { title, content, author, date } = await urlToMarkdown(url);

		return {
			type: 'url',
			source: url,
			title,
			author,
			date,
			content,
			metadata: {
				extractedAt: new Date().toISOString(),
				wordCount: content.split(/\s+/).length,
			},
		};
	}
}
