import LLMWikiPlugin from './main';

interface RestApiPlugin {
	registerEndpoint(config: {
		namespace: string;
		namespaceId: string;
		endpoint: string;
		method: 'GET' | 'POST';
		description: string;
		handler: (body?: unknown) => Promise<Record<string, unknown>>;
	}): Promise<void>;
}

interface RestApiRequestBody {
	url?: unknown;
}

interface AppWithPlugins {
	plugins: {
		plugins: Record<string, unknown>;
	};
}

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
		const appWithPlugins = this.plugin.app as typeof this.plugin.app & AppWithPlugins;
		const pluginsRegistry = appWithPlugins.plugins.plugins;
		const restApi = pluginsRegistry['obsidian-local-rest-api'] as RestApiPlugin | undefined;

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
			handler: (body?: unknown) => {
				try {
					const { url } = (body as RestApiRequestBody) ?? {};

					if (!url || typeof url !== 'string') {
						return Promise.resolve({
							success: false,
							error: 'URL is required and must be a string',
						});
					}

					// Process the URL using the sidebar view
					const sidebar = this.plugin.getSidebarView();
					if (!sidebar) {
						return Promise.resolve({
							success: false,
							error: 'Sidebar view not available. Please open the LLM Wiki sidebar first.',
						});
					}

					// Start processing asynchronously
					void sidebar.processUrl(url);

					return Promise.resolve({
						success: true,
						message: 'URL processing started. Check Obsidian for progress.',
					});
				} catch (error) {
					const message = error instanceof Error ? error.message : 'Unknown error';
					return Promise.resolve({
						success: false,
						error: message,
					});
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
			handler: () => Promise.resolve({
				success: true,
				data: {
					enabled: true,
					apiKeyConfigured: !!this.plugin.settings.apiKey,
					sidebarOpen: !!this.plugin.getSidebarView(),
					provider: this.plugin.settings.aiProvider,
					model: this.plugin.settings.model,
					wikiPath: this.plugin.settings.wikiPath,
				},
			}),
		});

		// Register endpoint to get plugin info
		await restApi.registerEndpoint({
			namespace: 'llm-wiki',
			namespaceId: 'llm-wiki',
			endpoint: 'info',
			method: 'GET',
			description: 'Get LLM Wiki plugin information',
			handler: () => Promise.resolve({
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
			}),
		});

	}

	/**
	 * Unregister REST API endpoints
	 */
	unregisterEndpoints(): void {
		const appWithPlugins = this.plugin.app as typeof this.plugin.app & AppWithPlugins;
		const pluginsRegistry = appWithPlugins.plugins.plugins;
		const restApi = pluginsRegistry['obsidian-local-rest-api'] as RestApiPlugin | undefined;

		if (!restApi) {
			return;
		}

		// The obsidian-local-rest-api plugin should handle cleanup automatically
		// when the plugin is unloaded
	}
}
