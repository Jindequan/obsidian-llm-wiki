import pdf from 'pdf-parse';
import { readLocalBinaryFile } from '../utils/desktop';

export async function pdfToMarkdown(filePath: string): Promise<{
	title: string;
	content: string;
}> {
	try {
		return pdfBufferToMarkdown(readLocalBinaryFile(filePath), filePath.split('/').pop() || 'Untitled document');
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		throw new Error(`Failed to parse PDF: ${message}`);
	}
}

export async function pdfBufferToMarkdown(
	dataBuffer: Uint8Array,
	sourceName: string
): Promise<{
	title: string;
	content: string;
}> {
	const data = await pdf(Buffer.from(dataBuffer));

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
	let title = sourceName || 'Untitled document';

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
}
