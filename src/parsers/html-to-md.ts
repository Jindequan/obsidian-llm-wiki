import * as cheerio from 'cheerio';
import { requestUrl } from 'obsidian';
import TurndownService from 'turndown';

export async function urlToMarkdown(url: string): Promise<{
	title: string;
	content: string;
	author?: string;
	date?: string;
}> {
	try {
		// Validate URL
		let validUrl: URL;
		try {
			validUrl = new URL(url);
		} catch {
			throw new Error('Invalid URL format');
		}

		if (!['http:', 'https:'].includes(validUrl.protocol)) {
			throw new Error('Only HTTP/HTTPS URLs are supported');
		}

		// Detect if it's a WeChat article
		const isWeChat = url.includes('mp.weixin.qq.com');

		// Build headers based on site
		const headers: Record<string, string> = {
			'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
			'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
			'Cache-Control': 'no-cache',
			'DNT': '1',
			'Pragma': 'no-cache',
			'Upgrade-Insecure-Requests': '1',
		};

		if (isWeChat) {
			headers['User-Agent'] = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.38(0x1800262f) NetType/WIFI Language/zh_CN';
			headers['Referer'] = 'https://mp.weixin.qq.com/';
		} else {
			headers['User-Agent'] = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
		}

		// Use Obsidian's native request API to avoid renderer-side CORS issues.
		const response = await requestUrl({
			url,
			method: 'GET',
			headers,
			throw: false,
		});

		if (response.status >= 400) {
			throw new Error(`HTTP ${response.status}`);
		}

		const html = response.text;
		if (!html || !html.trim()) {
			throw new Error('The page response was empty and no parsable HTML was returned.');
		}

		const $ = cheerio.load(html);

		// Extract metadata
		const title =
			$('meta[property="og:title"]').attr('content') ||
			$('meta[name="twitter:title"]').attr('content') ||
			$('title').text() ||
			$('h1').first().text() ||
			'Untitled';

		const author =
			$('meta[name="author"]').attr('content') ||
			$('meta[property="article:author"]').attr('content') ||
			$('[rel="author"]').text() ||
			undefined;

		const date =
			$('meta[property="article:published_time"]').attr('content') ||
			$('meta[name="date"]').attr('content') ||
			undefined;

		// Remove unwanted elements
		$('script, style, nav, footer, aside, .ad, .advertisement, .sidebar').remove();

		// Remove WeChat-specific unwanted elements
		if (isWeChat) {
			$('.rich_media_meta_extra, .rich_media_meta_text, .profile_nickname').remove();
		}

		// Try to find the main content - WeChat specific selector first
		const contentSelectors = isWeChat
			? ['.rich_media_content', '#js_content', 'article']
			: [
					'article',
					'[role="main"]',
					'main',
					'[itemprop="articleBody"]',
					'.main-content',
					'.content',
					'.post-content',
					'.article-content',
					'.entry-content',
					'.article',
					'.post',
					'#content',
			  ];

		let contentEl = null;
		for (const selector of contentSelectors) {
			contentEl = $(selector).first();
			if (contentEl.length) break;
		}

		// Fallback to body if no content found
		if (!contentEl || !contentEl.length) {
			contentEl = $('body');
		}

		// Convert HTML to Markdown
		const turndownService = new TurndownService({
			headingStyle: 'atx',
			codeBlockStyle: 'fenced',
		});

		// Add custom rules for better conversion
		turndownService.addRule('strikethrough', {
			filter: ['del', 's', 'strike'],
			replacement: (content: string) => `~~${content}~~`,
		});

		const content = turndownService.turndown(contentEl.html() || '');

		// Clean up excessive whitespace
		const cleanedContent = content
			.replace(/\n{3,}/g, '\n\n')
			.replace(/^\s+|\s+$/g, '')
			.trim();

		if (!cleanedContent) {
			throw new Error('The page was fetched, but no main content could be extracted. The site may use dynamic rendering or block automated access.');
		}

		return {
			title: title.trim(),
			content: cleanedContent,
			author,
			date,
		};
	} catch (error: any) {
		if (error?.status) {
			throw new Error(`HTTP ${error.status}`);
		}

		throw new Error(error.message || 'Unknown error');
	}
}
