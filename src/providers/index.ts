import { AIProvider, ProviderType } from './base';
import { AnthropicProvider } from './anthropic';
import { OpenAIProvider } from './openai';
import { ZAIProvider } from './zai';
import { DeepSeekProvider } from './deepseek';
import { AliQwenProvider } from './aliqwen';

export function createProvider(
	type: ProviderType,
	apiKey: string,
	model?: string,
	baseUrl?: string
): AIProvider {
	switch (type) {
		case 'anthropic':
			return new AnthropicProvider(apiKey, model);
		case 'openai':
			return new OpenAIProvider(apiKey, model);
		case 'zai':
			return new ZAIProvider(apiKey, model);
		case 'deepseek':
			return new DeepSeekProvider(apiKey, model);
		case 'aliqwen':
			return new AliQwenProvider(apiKey, model);
		case 'custom':
			if (!baseUrl) {
				throw new Error('Custom provider requires baseUrl');
			}
			return new OpenAIProvider(apiKey, model, baseUrl);
		default:
			throw new Error(`Unknown provider type: ${type}`);
	}
}

export {
	AnthropicProvider,
	OpenAIProvider,
	ZAIProvider,
	DeepSeekProvider,
	AliQwenProvider
};
export type { AIProvider, GenerateOptions, ProviderType, PROVIDER_BASE_URLS } from './base';
