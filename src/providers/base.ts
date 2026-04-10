export interface GenerateOptions {
	temperature?: number;
	maxTokens?: number;
	system?: string;
	onProgress?: (chunk: string) => void;
	signal?: AbortSignal;
}

export type ProviderType =
	| 'anthropic'
	| 'openai'
	| 'zai'
	| 'deepseek'
	| 'aliqwen'
	| 'custom';

export interface AIProvider {
	name: string;
	type: ProviderType;
	models: string[];
	defaultModel: string;
	baseUrl?: string;

	generate(prompt: string, options?: GenerateOptions): Promise<string>;

	generateStream(prompt: string, options?: GenerateOptions): AsyncGenerator<string, void, unknown>;
}

export class ProviderError extends Error {
	constructor(
		public provider: string,
		message: string,
		public code?: string
	) {
		super(`[${provider}] ${message}`);
		this.name = 'ProviderError';
	}
}

// Base URL configurations for different providers
export const PROVIDER_BASE_URLS: Record<ProviderType, string> = {
	anthropic: 'https://api.anthropic.com',
	openai: 'https://api.openai.com',
	zai: 'https://api.z.com/v1', // z.ai
	deepseek: 'https://api.deepseek.com/v1',
	aliqwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
	custom: '',
};
