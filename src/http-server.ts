import { Notice } from 'obsidian';
import LLMWikiPlugin from './main';

/**
 * Built-in HTTP server for LLM Wiki plugin
 * Runs a simple HTTP server to receive requests from browser extension
 */
export class HttpServer {
	private server: any = null;

	constructor(private plugin: LLMWikiPlugin) {}

	private get port(): number {
		return this.plugin.settings.httpServerPort || 27124;
	}

	/**
	 * Start the HTTP server
	 */
	async start() {
		try {
			// Try to use Node.js http module (available in Electron/Obsidian desktop)
			const http = await this.importHttpModule();

			if (!http) {
				new Notice('LLM Wiki: HTTP server not available (mobile/web only)');
				return;
			}

			// Create request handler
			const requestHandler = async (req: any, res: any) => {
				// Enable CORS
				res.setHeader('Access-Control-Allow-Origin', '*');
				res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
				res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

				if (req.method === 'OPTIONS') {
					res.writeHead(200);
					res.end();
					return;
				}

				// Parse URL path
				const url = new URL(req.url, `http://localhost:${this.port}`);
				const pathname = url.pathname;

				// Route handlers
				if (pathname === '/llm-wiki/status' && req.method === 'GET') {
					await this.handleStatus(req, res);
				} else if (pathname === '/llm-wiki/process-url' && req.method === 'POST') {
					await this.handleProcessUrl(req, res);
				} else if (pathname === '/llm-wiki/process-text' && req.method === 'POST') {
					await this.handleProcessText(req, res);
				} else if (pathname === '/llm-wiki/info' && req.method === 'GET') {
					await this.handleInfo(req, res);
				} else {
					res.writeHead(404);
					res.end(JSON.stringify({ error: 'Not found' }));
				}
			};

			// Start server
			this.server = http.createServer(requestHandler);

			this.server.listen(this.port, () => {
				new Notice(`LLM Wiki: HTTP server running on port ${this.port}`);
			});

			this.server.on('error', (error: any) => {
				if (error.code === 'EADDRINUSE') {
					new Notice(`LLM Wiki: Port ${this.port} already in use`);
				} else {
					new Notice(`LLM Wiki: HTTP server error: ${error.message || 'Unknown error'}`);
				}
			});

		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			new Notice(`LLM Wiki: Failed to start HTTP server: ${message}`);
		}
	}

	/**
	 * Stop the HTTP server
	 */
	stop() {
		if (this.server) {
			this.server.close(() => {});
			this.server = null;
		}
	}

	/**
	 * Try to import Node.js http module
	 */
	private async importHttpModule(): Promise<any> {
		try {
			// Try Electron's require first (Obsidian desktop)
			if ((window as any).require) {
				const electronHttp = (window as any).require('http');
				return electronHttp;
			}
		} catch {
			// Not available
		}

		// Dynamic import might work in some environments
		try {
			const httpModule = await import('http');
			return httpModule.default || httpModule;
		} catch {
			return null;
		}
	}

	/**
	 * Handle /llm-wiki/status endpoint
	 */
	private async handleStatus(_req: any, res: any) {
		try {
			const hasApiKey = !!this.plugin.settings.apiKey;
			const sidebarOpen = !!this.plugin.sidebarView;

			const response = {
				success: true,
				data: {
					enabled: true,
					apiKeyConfigured: hasApiKey,
					sidebarOpen,
					provider: this.plugin.settings.aiProvider,
					model: this.plugin.settings.model,
					wikiPath: this.plugin.settings.wikiPath,
				},
			};

			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify(response));
		} catch (error: any) {
			res.writeHead(500, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ success: false, error: error.message }));
		}
	}

	/**
	 * Handle /llm-wiki/process-url endpoint
	 */
	private async handleProcessUrl(req: any, res: any) {
		try {
			// Read request body
			let body = '';
			req.on('data', (chunk: any) => {
				body += chunk.toString();
			});

			req.on('end', async () => {
				try {
					const data = JSON.parse(body);
					const { url } = data;

					if (!url || typeof url !== 'string') {
						res.writeHead(400, { 'Content-Type': 'application/json' });
						res.end(JSON.stringify({
							success: false,
							error: 'URL is required and must be a string',
						}));
						return;
					}

					// Process the URL using the sidebar view
					const sidebar = this.plugin.sidebarView;
					if (!sidebar) {
						res.writeHead(200, { 'Content-Type': 'application/json' });
						res.end(JSON.stringify({
							success: false,
							error: 'Sidebar view not available. Please open the LLM Wiki sidebar first.',
						}));
						return;
					}

					// Start processing asynchronously
					sidebar.processUrl(url);

					new Notice('LLM Wiki: Processing URL from browser');

					res.writeHead(200, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({
						success: true,
						message: 'URL processing started. Check Obsidian for progress.',
					}));
				} catch (error: any) {
					res.writeHead(500, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({
						success: false,
						error: error.message || 'Unknown error',
					}));
				}
			});
		} catch (error: any) {
			res.writeHead(500, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ success: false, error: error.message }));
		}
	}

	/**
	 * Handle /llm-wiki/process-text endpoint
	 */
	private async handleProcessText(req: any, res: any) {
		try {
			// Read request body
			let body = '';
			req.on('data', (chunk: any) => {
				body += chunk.toString();
			});

			req.on('end', async () => {
				try {
					const data = JSON.parse(body);
					const { text } = data;

					if (!text || typeof text !== 'string') {
						res.writeHead(400, { 'Content-Type': 'application/json' });
						res.end(JSON.stringify({
							success: false,
							error: 'Text is required and must be a string',
						}));
						return;
					}

					// Process the text using the sidebar view
					const sidebar = this.plugin.sidebarView;

					if (!sidebar) {
						res.writeHead(200, { 'Content-Type': 'application/json' });
						res.end(JSON.stringify({
							success: false,
							error: 'Sidebar view not available. Please open the LLM Wiki sidebar first.',
						}));
						return;
					}

					// Start processing asynchronously - set text content directly
					// We need to call the internal process method with the text
					// For now, we'll set the input value and trigger processing
					const inputEl = (sidebar as any).inputEl;

					if (inputEl) {
						inputEl.value = text;
						await (sidebar as any).handleProcess();
					}

					new Notice('LLM Wiki: Processing text from browser');

					res.writeHead(200, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({
						success: true,
						message: 'Text processing started. Check Obsidian for progress.',
					}));
				} catch (error: any) {
					res.writeHead(500, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({
						success: false,
						error: error.message || 'Unknown error',
					}));
				}
			});
		} catch (error: any) {
			res.writeHead(500, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ success: false, error: error.message }));
		}
	}

	/**
	 * Handle /llm-wiki/info endpoint
	 */
	private async handleInfo(_req: any, res: any) {
		try {
			const response = {
				success: true,
				data: {
					name: 'LLM Wiki',
					version: '0.1.1',
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
		} catch (error: any) {
			res.writeHead(500, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ success: false, error: error.message }));
		}
	}
}
