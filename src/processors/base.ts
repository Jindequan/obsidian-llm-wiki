export interface ExtractedContent {
	type: 'url' | 'file';
	source: string;
	title: string;
	author?: string;
	date?: string;
	content: string;
	metadata?: Record<string, unknown>;
}

export interface ContentProcessor {
	type: 'url' | 'file';
	extract(source: string): Promise<ExtractedContent>;
}
