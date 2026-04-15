import { Notice } from 'obsidian';
import LLMWikiPlugin from './main';

interface HttpModule {
	createServer(handler: (req: unknown, res: unknown) => void): NodeHttpServer;
}

interface NodeHttpServer {
	listen(port: number, callback?: () => void): void;
	close(callback?: () => void): void;
	on(event: 'error', callback: (error: NodeJS.ErrnoException) => void): void;
}

interface IncomingRequest {
	method?: string;
	url?: string;
	on(event: 'data', callback: (chunk: Uint8Array | string) => void): void;
	on(event: 'end', callback: () => void): void;
	on(event: 'error', callback: (error: Error) => void): void;
	on(event: 'aborted', callback: () => void): void;
}

interface ServerResponse {
	setHeader(name: string, value: string): void;
	writeHead(status: number, headers?: Record<string, string>): void;
	end(body?: string): void;
}

interface ProcessUrlRequestBody {
	url?: unknown;
}

interface ProcessTextRequestBody {
	text?: unknown;
}

/**
 * Built-in HTTP server for LLM Wiki plugin
 * Runs a simple HTTP server to receive requests from browser extension
 */
export class HttpServer {
	private server: NodeHttpServer | null = null;

	constructor(private plugin: LLMWikiPlugin) {}

	private get port(): number {
		return this.plugin.settings.httpServerPort || 27124;
	}

	async start(): Promise<void> {
		try {
			const http = await this.importHttpModule();
			if (!http) {
				new Notice('LLM Wiki: HTTP server not available (mobile/web only)');
				return;
			}

			const requestHandler = (req: unknown, res: unknown): void => {
				void this.routeRequest(req as IncomingRequest, res as ServerResponse);
			};

			this.server = http.createServer(requestHandler);
			this.server.listen(this.port, () => {
				new Notice(`LLM Wiki: HTTP server running on port ${this.port}`);
			});

			this.server.on('error', (error) => {
				if (error.code === 'EADDRINUSE') {
					new Notice(`LLM Wiki: Port ${this.port} already in use`);
					return;
				}

				new Notice(`LLM Wiki: HTTP server error: ${error.message || 'Unknown error'}`);
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			new Notice(`LLM Wiki: Failed to start HTTP server: ${message}`);
		}
	}

	stop(): void {
		if (this.server) {
			this.server.close(() => {});
			this.server = null;
		}
	}

	private async importHttpModule(): Promise<HttpModule | null> {
		try {
			const desktopWindow = window as typeof window & {
				require?: (module: string) => HttpModule;
			};
			if (desktopWindow.require) {
				return desktopWindow.require('http');
			}
		} catch {
			// Not available in the current environment.
		}

		try {
			const httpModule = await import('http');
			return (httpModule.default || httpModule) as HttpModule;
		} catch {
			return null;
		}
	}

	private async routeRequest(request: IncomingRequest, response: ServerResponse): Promise<void> {
		response.setHeader('Access-Control-Allow-Origin', '*');
		response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
		response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

		if (request.method === 'OPTIONS') {
			response.writeHead(200);
			response.end();
			return;
		}

		const url = new URL(request.url ?? '/', `http://localhost:${this.port}`);
		const pathname = url.pathname;

		if (pathname === '/llm-wiki/status' && request.method === 'GET') {
			this.handleStatus(response);
			return;
		}

		if (pathname === '/llm-wiki/process-url' && request.method === 'POST') {
			await this.handleProcessUrl(request, response);
			return;
		}

		if (pathname === '/llm-wiki/process-text' && request.method === 'POST') {
			await this.handleProcessText(request, response);
			return;
		}

		if (pathname === '/llm-wiki/info' && request.method === 'GET') {
			this.handleInfo(response);
			return;
		}

		response.writeHead(404);
		response.end(JSON.stringify({ error: 'Not found' }));
	}

	private handleStatus(res: ServerResponse): void {
		try {
			const response = {
				success: true,
				data: {
					enabled: true,
					apiKeyConfigured: !!this.plugin.settings.apiKey,
					sidebarOpen: !!this.plugin.getSidebarView(),
					provider: this.plugin.settings.aiProvider,
					model: this.plugin.settings.model,
					wikiPath: this.plugin.settings.wikiPath,
				},
			};

			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify(response));
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			res.writeHead(500, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ success: false, error: message }));
		}
	}

	private async handleProcessUrl(req: IncomingRequest, res: ServerResponse): Promise<void> {
		try {
			const body = await this.readRequestBody(req);
			const data = JSON.parse(body) as ProcessUrlRequestBody;

			if (!data.url || typeof data.url !== 'string') {
				res.writeHead(400, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ success: false, error: 'URL is required and must be a string' }));
				return;
			}

			const sidebar = this.plugin.getSidebarView();
			if (!sidebar) {
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({
					success: false,
					error: 'Sidebar view not available. Please open the LLM Wiki sidebar first.',
				}));
				return;
			}

			void sidebar.processUrl(data.url);
			new Notice('LLM Wiki: Processing URL from browser');

			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({
				success: true,
				message: 'URL processing started. Check Obsidian for progress.',
			}));
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			res.writeHead(500, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ success: false, error: message }));
		}
	}

	private async handleProcessText(req: IncomingRequest, res: ServerResponse): Promise<void> {
		try {
			const body = await this.readRequestBody(req);
			const data = JSON.parse(body) as ProcessTextRequestBody;

			if (!data.text || typeof data.text !== 'string') {
				res.writeHead(400, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ success: false, error: 'Text is required and must be a string' }));
				return;
			}

			const sidebar = this.plugin.getSidebarView();
			if (!sidebar) {
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({
					success: false,
					error: 'Sidebar view not available. Please open the LLM Wiki sidebar first.',
				}));
				return;
			}

			void sidebar.processText(data.text);
			new Notice('LLM Wiki: Processing text from browser');

			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({
				success: true,
				message: 'Text processing started. Check Obsidian for progress.',
			}));
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			res.writeHead(500, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ success: false, error: message }));
		}
	}

	private handleInfo(res: ServerResponse): void {
		try {
			const response = {
				success: true,
				data: {
					name: 'LLM Wiki',
					version: this.plugin.manifest.version,
					description: 'Turn URLs, PDFs, and files into structured wiki pages with AI.',
					settings: {
						aiProvider: this.plugin.settings.aiProvider,
						model: this.plugin.settings.model,
						wikiPath: this.plugin.settings.wikiPath,
						enableSidebar: this.plugin.settings.enableSidebar,
					},
				},
			};

			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify(response));
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			res.writeHead(500, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ success: false, error: message }));
		}
	}

	private readRequestBody(req: IncomingRequest): Promise<string> {
		return new Promise((resolve, reject) => {
			let body = '';
			req.on('data', (chunk) => {
				body += chunk.toString();
			});
			req.on('end', () => {
				resolve(body);
			});
			req.on('error', (error) => {
				reject(error);
			});
			req.on('aborted', () => {
				reject(new Error('Request aborted'));
			});
		});
	}
}
