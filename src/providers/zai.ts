import { AIProvider, GenerateOptions, PROVIDER_BASE_URLS } from './base';
import { buildChatMessages, generateSingleChunkStream, postJson } from './http';

type ZAIResponse = {
	choices?: Array<{
		message?: {
			content?: string;
		};
	}>;
};

export class ZAIProvider implements AIProvider {
	name = 'Z.AI';
	type = 'zai' as const;
	baseUrl = PROVIDER_BASE_URLS.zai;
	models = [
		'glm-4-plus',
		'glm-4-0520',
		'glm-4-air',
		'glm-4-flash',
		'glm-3-turbo',
	];
	defaultModel = 'glm-4-plus';

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
		const response = await postJson<ZAIResponse>(
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
			throw new Error('Z.AI returned an empty response.');
		}

		return content;
	}

	async *generateStream(prompt: string, options?: GenerateOptions): AsyncGenerator<string, void, unknown> {
		yield* generateSingleChunkStream(this.generate(prompt, options), options?.onProgress);
	}
}
