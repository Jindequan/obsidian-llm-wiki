import axios from 'axios';
import { AIProvider, GenerateOptions, ProviderError, PROVIDER_BASE_URLS } from './base';

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

		const messages: any[] = [];

		if (system) {
			messages.push({ role: 'system', content: system });
		}

		messages.push({ role: 'user', content: prompt });

		try {
			const response = await axios.post(
				`${this.baseUrl}/chat/completions`,
				{
					model: this.model,
					messages,
					max_tokens: maxTokens,
					temperature,
					stream: false,
				},
				{
					headers: {
						'Authorization': `Bearer ${this.apiKey}`,
						'Content-Type': 'application/json',
					},
					signal: signal as any,
				}
			);

			return response.data.choices[0].message.content;
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

		const messages: any[] = [];

		if (system) {
			messages.push({ role: 'system', content: system });
		}

		messages.push({ role: 'user', content: prompt });

		try {
			const response = await axios.post(
				`${this.baseUrl}/chat/completions`,
				{
					model: this.model,
					messages,
					max_tokens: maxTokens,
					temperature,
					stream: true,
				},
				{
					headers: {
						'Authorization': `Bearer ${this.apiKey}`,
						'Content-Type': 'application/json',
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
					if (line.startsWith('data:')) {
						const data = line.slice(5).trim();

						if (data === '[DONE]') continue;

						try {
							const parsed = JSON.parse(data);
							const delta = parsed.choices[0]?.delta?.content;

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
