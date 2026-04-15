import { AIProvider, GenerateOptions, PROVIDER_BASE_URLS } from './base';
import { generateSingleChunkStream, postJson } from './http';

type AnthropicResponse = {
	content?: Array<{
		type?: string;
		text?: string;
	}>;
};

export class AnthropicProvider implements AIProvider {
	name = 'Anthropic';
	type = 'anthropic' as const;
	baseUrl = PROVIDER_BASE_URLS.anthropic;
	models = [
		'claude-3-5-sonnet-20241022',
		'claude-3-5-haiku-20241022',
		'claude-3-opus-20240229',
		'claude-3-sonnet-20240229',
		'claude-3-haiku-20240307',
	];
	defaultModel = 'claude-3-5-sonnet-20241022';

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
		const response = await postJson<AnthropicResponse>(
			this.name,
			`${this.baseUrl}/v1/messages`,
			{
				'x-api-key': this.apiKey,
				'anthropic-version': '2023-06-01',
			},
			{
				model: this.model,
				max_tokens: maxTokens,
				temperature,
				system,
				messages: [{ role: 'user', content: prompt }],
			},
			signal
		);

		const text = response.content?.find((block) => block.type === 'text' && typeof block.text === 'string')?.text;
		if (!text) {
			throw new Error('Anthropic returned an empty response.');
		}

		return text;
	}

	async *generateStream(prompt: string, options?: GenerateOptions): AsyncGenerator<string, void, unknown> {
		yield* generateSingleChunkStream(this.generate(prompt, options), options?.onProgress);
	}
}
