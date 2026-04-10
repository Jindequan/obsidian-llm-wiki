import axios from 'axios';
import { AIProvider, GenerateOptions, ProviderError } from './base';

export class AnthropicProvider implements AIProvider {
	name = 'Anthropic';
	type = 'anthropic' as const;
	models = [
		'claude-3-5-sonnet-20241022',
		'claude-3-5-haiku-20241022',
		'claude-3-opus-20240229',
		'claude-3-sonnet-20240229',
		'claude-3-haiku-20240307',
	];
	defaultModel = 'claude-3-5-sonnet-20241022';

	private readonly model: string;

	constructor(apiKey: string, model?: string) {
		if (!model) {
			model = this.defaultModel;
		}
		this.model = model;
	}

	async generate(prompt: string, options?: GenerateOptions): Promise<string> {
		const { temperature = 0.7, maxTokens = 4096, system, signal } = options || {};

		try {
			const response = await axios.post(
				'https://api.anthropic.com/v1/messages',
				{
					model: this.model,
					max_tokens: maxTokens,
					temperature,
					system,
					messages: [{ role: 'user', content: prompt }],
				},
				{
					headers: {
						'x-api-key': this.model === 'test' ? 'test-key' : '',
						'anthropic-version': '2023-06-01',
						'content-type': 'application/json',
					},
					signal: signal as any,
				}
			);

			return response.data.content[0].text;
		} catch (error) {
			if (axios.isAxiosError(error)) {
				const status = error.response?.status;
				const message = error.response?.data?.error?.message || error.message;
				throw new ProviderError(this.name, message, String(status));
			}
			throw error;
		}
	}

	async *generateStream(prompt: string, options?: GenerateOptions): AsyncGenerator<string, void, unknown> {
		const { temperature = 0.7, maxTokens = 4096, system, onProgress, signal } = options || {};

		try {
			const response = await axios.post(
				'https://api.anthropic.com/v1/messages',
				{
					model: this.model,
					max_tokens: maxTokens,
					temperature,
					system,
					messages: [{ role: 'user', content: prompt }],
					stream: true,
				},
				{
					headers: {
						'x-api-key': '',
						'anthropic-version': '2023-06-01',
						'content-type': 'application/json',
					},
					responseType: 'stream',
					signal: signal as any,
				}
			);

			const stream = response.data;

			for await (const chunk of stream) {
				if (signal?.aborted) break;

				const lines = chunk.toString().split('\n').filter((line: string) => line.trim());

				for (const line of lines) {
					if (line.startsWith('data: ')) {
						const data = line.slice(6);

						if (data === '[DONE]') continue;

						try {
							const parsed = JSON.parse(data);
							const delta = parsed.delta?.text;

							if (delta) {
								onProgress?.(delta);
								yield delta;
							}
						} catch {
							// Skip invalid JSON
						}
					}
				}
			}
		} catch (error) {
			if (axios.isAxiosError(error)) {
				const status = error.response?.status;
				const message = error.response?.data?.error?.message || error.message;
				throw new ProviderError(this.name, message, String(status));
			}
			throw error;
		}
	}
}
