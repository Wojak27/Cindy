import https from 'https';
import http from 'http';
import { URL } from 'url';

interface LinkPreview {
    title: string;
    description: string;
    image?: string;
    url: string;
    siteName?: string;
}

export class LinkPreviewService {
    private cache = new Map<string, { preview: LinkPreview; timestamp: number }>();
    private readonly CACHE_TTL = 1000 * 60 * 60; // 1 hour

    async getPreview(url: string): Promise<LinkPreview | null> {
        try {
            // Check cache first
            const cached = this.cache.get(url);
            if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
                return cached.preview;
            }

            // Fetch the webpage
            const html = await this.fetchHtml(url);
            if (!html) return null;

            // Parse meta tags
            const preview = this.parseMetaTags(html, url);
            
            // Cache the result
            this.cache.set(url, { preview, timestamp: Date.now() });
            
            return preview;
        } catch (error) {
            console.error('Failed to get link preview:', error);
            return null;
        }
    }

    private async fetchHtml(url: string): Promise<string | null> {
        return new Promise((resolve, reject) => {
            try {
                const urlObj = new URL(url);
                const isHttps = urlObj.protocol === 'https:';
                const client = isHttps ? https : http;
                
                const options = {
                    hostname: urlObj.hostname,
                    port: urlObj.port || (isHttps ? 443 : 80),
                    path: urlObj.pathname + urlObj.search,
                    method: 'GET',
                    headers: {
                        'User-Agent': 'Cindy Voice Assistant/1.0 (Link Preview)',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.5'
                    },
                    timeout: 5000
                };

                const req = client.request(options, (res) => {
                    // Handle redirects
                    if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                        this.fetchHtml(res.headers.location).then(resolve).catch(reject);
                        return;
                    }

                    if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
                        reject(new Error(`HTTP ${res.statusCode}`));
                        return;
                    }

                    let data = '';
                    res.setEncoding('utf8');
                    res.on('data', (chunk) => {
                        data += chunk;
                        // Limit response size to prevent memory issues
                        if (data.length > 500000) { // 500KB limit
                            req.destroy();
                            reject(new Error('Response too large'));
                        }
                    });

                    res.on('end', () => resolve(data));
                });

                req.on('error', reject);
                req.on('timeout', () => {
                    req.destroy();
                    reject(new Error('Request timeout'));
                });

                req.end();
            } catch (error) {
                reject(error);
            }
        });
    }

    private parseMetaTags(html: string, url: string): LinkPreview {
        const preview: LinkPreview = {
            title: '',
            description: '',
            url: url
        };

        try {
            // Extract title from various sources
            const ogTitle = this.extractMeta(html, 'og:title');
            const twitterTitle = this.extractMeta(html, 'twitter:title');
            const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i);
            
            preview.title = ogTitle || twitterTitle || (titleTag ? titleTag[1].trim() : '') || 'Untitled';

            // Extract description
            const ogDescription = this.extractMeta(html, 'og:description');
            const twitterDescription = this.extractMeta(html, 'twitter:description');
            const metaDescription = this.extractMeta(html, 'description');
            
            preview.description = ogDescription || twitterDescription || metaDescription || '';

            // Extract image
            const ogImage = this.extractMeta(html, 'og:image');
            const twitterImage = this.extractMeta(html, 'twitter:image');
            
            if (ogImage || twitterImage) {
                const imageUrl = ogImage || twitterImage;
                // Convert relative URLs to absolute
                if (imageUrl?.startsWith('/')) {
                    const urlObj = new URL(url);
                    preview.image = `${urlObj.protocol}//${urlObj.host}${imageUrl}`;
                } else if (imageUrl?.startsWith('http')) {
                    preview.image = imageUrl;
                }
            }

            // Extract site name
            const ogSiteName = this.extractMeta(html, 'og:site_name');
            if (ogSiteName) {
                preview.siteName = ogSiteName;
            } else {
                // Fallback to domain name
                try {
                    const urlObj = new URL(url);
                    preview.siteName = urlObj.hostname;
                } catch (error) {
                    // Ignore error
                }
            }

            // Clean up text content
            preview.title = this.cleanText(preview.title);
            preview.description = this.cleanText(preview.description);

            return preview;
        } catch (error) {
            console.error('Error parsing meta tags:', error);
            return preview;
        }
    }

    private extractMeta(html: string, property: string): string | null {
        // Try Open Graph format first
        const ogRegex = new RegExp(`<meta[^>]+property=["']og:${property}["'][^>]+content=["']([^"']+)["']`, 'i');
        const ogMatch = html.match(ogRegex);
        if (ogMatch) return ogMatch[1];

        // Try Twitter format
        const twitterRegex = new RegExp(`<meta[^>]+name=["']twitter:${property}["'][^>]+content=["']([^"']+)["']`, 'i');
        const twitterMatch = html.match(twitterRegex);
        if (twitterMatch) return twitterMatch[1];

        // Try standard meta format
        const metaRegex = new RegExp(`<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i');
        const metaMatch = html.match(metaRegex);
        if (metaMatch) return metaMatch[1];

        // Try reversed format (content first)
        const reversedRegex = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:|twitter:)?${property}["']`, 'i');
        const reversedMatch = html.match(reversedRegex);
        if (reversedMatch) return reversedMatch[1];

        return null;
    }

    private cleanText(text: string): string {
        return text
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&nbsp;/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    // Clear old cache entries periodically
    public clearOldCache(): void {
        const now = Date.now();
        for (const [url, cached] of this.cache.entries()) {
            if (now - cached.timestamp > this.CACHE_TTL) {
                this.cache.delete(url);
            }
        }
    }
}