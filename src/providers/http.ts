import { requestUrl } from 'obsidian';
import { ProviderError } from './base';

export type ProviderMessage = {
	role: 'system' | 'user' | 'assistant';
	content: string;
};

type JsonValue = Record<string, unknown>;

export async function postJson<TResponse>(
	providerName: string,
	url: string,
	apiKeyHeader: Record<string, string>,
	body: JsonValue,
	signal?: AbortSignal
): Promise<TResponse> {
	throwIfAborted(signal);

	const response = await requestUrl({
		url,
		method: 'POST',
		contentType: 'application/json',
		headers: {
			...apiKeyHeader,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(body),
		throw: false,
	});

	throwIfAborted(signal);

	const payload = parseJson(response.text);
	if (response.status >= 400) {
		throw new ProviderError(providerName, extractErrorMessage(payload, response.status), String(response.status));
	}

	return payload as TResponse;
}

export async function* generateSingleChunkStream(
	textPromise: Promise<string>,
	onProgress?: (chunk: string) => void
): AsyncGenerator<string, void, unknown> {
	const text = await textPromise;
	if (!text) {
		return;
	}

	onProgress?.(text);
	yield text;
}

export function buildChatMessages(prompt: string, system?: string): ProviderMessage[] {
	const messages: ProviderMessage[] = [];
	if (system) {
		messages.push({ role: 'system', content: system });
	}
	messages.push({ role: 'user', content: prompt });
	return messages;
}

function throwIfAborted(signal?: AbortSignal): void {
	if (signal?.aborted) {
		const error = new Error('The request was aborted.');
		error.name = 'AbortError';
		throw error;
	}
}

function parseJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return { message: text };
	}
}

function extractErrorMessage(payload: unknown, status: number): string {
	if (typeof payload === 'object' && payload !== null) {
		const directMessage = getString(payload, 'message');
		if (directMessage) {
			return directMessage;
		}

		const error = (payload as Record<string, unknown>).error;
		if (typeof error === 'object' && error !== null) {
			const nestedMessage = getString(error, 'message');
			if (nestedMessage) {
				return nestedMessage;
			}
		}
	}

	return `HTTP ${status}`;
}

function getString(payload: object, key: string): string | null {
	const value = (payload as Record<string, unknown>)[key];
	return typeof value === 'string' && value.length > 0 ? value : null;
}
