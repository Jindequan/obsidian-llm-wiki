import { AIProvider, GenerateOptions, PROVIDER_BASE_URLS } from './base';
import { buildChatMessages, generateSingleChunkStream, postJson } from './http';

type OpenAIResponse = {
	choices?: Array<{
		message?: {
			content?: string;
		};
	}>;
};

export class OpenAIProvider implements AIProvider {
	name = 'OpenAI';
	type = 'openai' as const;
	baseUrl: string;
	models = [
		'gpt-4-turbo-preview',
		'gpt-4',
		'gpt-4-32k',
		'gpt-3.5-turbo',
		'gpt-3.5-turbo-16k',
	];
	defaultModel = 'gpt-4-turbo-preview';

	private readonly model: string;
	private readonly apiKey: string;

	constructor(apiKey: string, model?: string, baseUrl = `${PROVIDER_BASE_URLS.openai}/v1`) {
		if (!model) {
			model = this.defaultModel;
		}
		this.model = model;
		this.apiKey = apiKey;
		this.baseUrl = baseUrl;
	}

	async generate(prompt: string, options?: GenerateOptions): Promise<string> {
		const { temperature = 0.7, maxTokens = 4096, system, signal } = options || {};
		const response = await postJson<OpenAIResponse>(
			this.name,
			`${this.baseUrl}/chat/completions`,
			{ Authorization: `Bearer ${this.apiKey}` },
			{
				model: this.model,
				messages: buildChatMessages(prompt, system),
				max_tokens: maxTokens,
				temperature,
			},
			signal
		);

		const content = response.choices?.[0]?.message?.content;
		if (!content) {
			throw new Error('OpenAI returned an empty response.');
		}

		return content;
	}

	async *generateStream(prompt: string, options?: GenerateOptions): AsyncGenerator<string, void, unknown> {
		yield* generateSingleChunkStream(this.generate(prompt, options), options?.onProgress);
	}
}
