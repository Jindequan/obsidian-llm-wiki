import { readFileSync } from 'fs';
import pdf from 'pdf-parse';

export async function pdfToMarkdown(filePath: string): Promise<{
	title: string;
	content: string;
}> {
	try {
		const dataBuffer = readFileSync(filePath);
		const data = await pdf(dataBuffer);

		// Extract text content
		let content = data.text;

		// Clean up the text
		content = content
			// Remove excessive whitespace
			.replace(/\s{3,}/g, '  ')
			// Remove page numbers (common pattern)
			.replace(/\n\s*\d+\s*\n/g, '\n')
			// Fix broken lines
			.replace(/([a-z])\n([a-z])/g, '$1 $2')
			// Remove excessive newlines
			.replace(/\n{3,}/g, '\n\n')
			.trim();

		// Try to extract title from first few lines
		const lines = content.split('\n');
		let title = filePath.split('/').pop() || 'Untitled Document';

		// First non-empty line is often the title
		for (const line of lines) {
			const trimmed = line.trim();
			if (trimmed.length > 5 && trimmed.length < 100) {
				title = trimmed;
				break;
			}
		}

		return {
			title,
			content,
		};
	} catch (error) {
		throw new Error(`Failed to parse PDF: ${error.message}`);
	}
}
