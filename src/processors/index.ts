import { ContentProcessor } from './base';
import { URLProcessor } from './url';
import { FileProcessor } from './file';

export function createProcessor(type: 'url' | 'file'): ContentProcessor {
	switch (type) {
		case 'url':
			return new URLProcessor();
		case 'file':
			return new FileProcessor();
		default:
			throw new Error(`Unknown processor type: ${type}`);
	}
}

export { URLProcessor, FileProcessor };
export type { ContentProcessor, ExtractedContent } from './base';
