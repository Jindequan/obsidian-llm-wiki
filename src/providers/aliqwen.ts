import { AIProvider, GenerateOptions, PROVIDER_BASE_URLS } from './base';
import { buildChatMessages, generateSingleChunkStream, postJson } from './http';

type AliQwenResponse = {
	choices?: Array<{
		message?: {
			content?: string;
		};
	}>;
};

export class AliQwenProvider implements AIProvider {
	name = 'Ali Qwen';
	type = 'aliqwen' as const;
	baseUrl = PROVIDER_BASE_URLS.aliqwen;
	models = [
		'qwen-max',
		'qwen-plus',
		'qwen-turbo',
		'qwen-long',
	];
	defaultModel = 'qwen-max';

	private readonly model: string;
	private readonly apiKey: string;

	constructor(apiKey: string, model?: string) {
		if (!model) {
			model = this.defaultModel;
		}
		this.model = model;
		this.apiKey = apiKey;
	}

	async generate(prompt: string, options?: GenerateOptions): Promise<string> {
		const { temperature = 0.7, maxTokens = 4096, system, signal } = options || {};
		const response = await postJson<AliQwenResponse>(
			this.name,
			`${this.baseUrl}/chat/completions`,
			{ Authorization: `Bearer ${this.apiKey}` },
			{
				model: this.model,
				messages: buildChatMessages(prompt, system),
				max_tokens: maxTokens,
				temperature,
				stream: false,
			},
			signal
		);

		const content = response.choices?.[0]?.message?.content;
		if (!content) {
			throw new Error('Ali Qwen returned an empty response.');
		}

		return content;
	}

	async *generateStream(prompt: string, options?: GenerateOptions): AsyncGenerator<string, void, unknown> {
		yield* generateSingleChunkStream(this.generate(prompt, options), options?.onProgress);
	}
}
