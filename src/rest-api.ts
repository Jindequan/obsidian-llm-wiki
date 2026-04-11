import LLMWikiPlugin from './main';

/**
 * REST API handler for LLM Wiki plugin
 * Integrates with obsidian-local-rest-api to expose endpoints
 */
export class RestApiHandler {
	constructor(private plugin: LLMWikiPlugin) {}

	/**
	 * Register REST API endpoints with obsidian-local-rest-api
	 */
	async registerEndpoints() {
		// @ts-ignore - obsidian-local-rest-api is not in the type definitions
		const restApi = this.plugin.app.plugins.plugins['obsidian-local-rest-api'];

		if (!restApi) {
			return;
		}

		// Register endpoint to process a URL
		await restApi.registerEndpoint({
			namespace: 'llm-wiki',
			namespaceId: 'llm-wiki',
			endpoint: 'process-url',
			method: 'POST',
			description: 'Process a URL and generate wiki pages',
			handler: async (body: any) => {
				try {
					const { url } = body;

					if (!url || typeof url !== 'string') {
						return {
							success: false,
							error: 'URL is required and must be a string',
						};
					}

					// Process the URL using the sidebar view
					const sidebar = this.plugin.sidebarView;
					if (!sidebar) {
						return {
							success: false,
							error: 'Sidebar view not available. Please open the LLM Wiki sidebar first.',
						};
					}

					// Start processing asynchronously
					sidebar.processUrl(url);

					return {
						success: true,
						message: 'URL processing started. Check Obsidian for progress.',
					};
				} catch (error: any) {
					return {
						success: false,
						error: error.message || 'Unknown error',
					};
				}
			},
		});

		// Register endpoint to check plugin status
		await restApi.registerEndpoint({
			namespace: 'llm-wiki',
			namespaceId: 'llm-wiki',
			endpoint: 'status',
			method: 'GET',
			description: 'Check LLM Wiki plugin status',
			handler: async () => {
				const hasApiKey = !!this.plugin.settings.apiKey;
				const sidebarOpen = !!this.plugin.sidebarView;

				return {
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
			},
		});

		// Register endpoint to get plugin info
		await restApi.registerEndpoint({
			namespace: 'llm-wiki',
			namespaceId: 'llm-wiki',
			endpoint: 'info',
			method: 'GET',
			description: 'Get LLM Wiki plugin information',
			handler: async () => {
				return {
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
			},
		});

	}

	/**
	 * Unregister REST API endpoints
	 */
	async unregisterEndpoints() {
		// @ts-ignore
		const restApi = this.plugin.app.plugins.plugins['obsidian-local-rest-api'];

		if (!restApi) {
			return;
		}

		// The obsidian-local-rest-api plugin should handle cleanup automatically
		// when the plugin is unloaded
	}
}
