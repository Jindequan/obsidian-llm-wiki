import { AIProvider, GenerateOptions, PROVIDER_BASE_URLS } from './base';
import { buildChatMessages, generateSingleChunkStream, postJson } from './http';

type DeepSeekResponse = {
	choices?: Array<{
		message?: {
			content?: string;
		};
	}>;
};

export class DeepSeekProvider implements AIProvider {
	name = 'DeepSeek';
	type = 'deepseek' as const;
	baseUrl = PROVIDER_BASE_URLS.deepseek;
	models = [
		'deepseek-chat',
		'deepseek-coder',
	];
	defaultModel = 'deepseek-chat';

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
		const response = await postJson<DeepSeekResponse>(
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
			throw new Error('DeepSeek returned an empty response.');
		}

		return content;
	}

	async *generateStream(prompt: string, options?: GenerateOptions): AsyncGenerator<string, void, unknown> {
		yield* generateSingleChunkStream(this.generate(prompt, options), options?.onProgress);
	}
}
