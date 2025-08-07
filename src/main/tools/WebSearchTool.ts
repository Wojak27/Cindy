import https from 'https';
import http from 'http';
import { URL } from 'url';

interface SearchResult {
    title: string;
    link: string;
    snippet: string;
}

export class WebSearchTool {
    constructor() { }

    async execute(query: string): Promise<string> {
        try {
            console.log('🔍 WebSearchTool: Performing web search for:', query);
            
            // Try multiple search approaches
            const results = await this.performSearch(query);
            
            if (results.length > 0) {
                let result = `Search results for "${query}":\n\n`;
                
                results.forEach((item, index) => {
                    result += `${index + 1}. **${item.title}**\n`;
                    result += `   ${item.snippet}\n`;
                    result += `   🔗 ${item.link}\n\n`;
                });
                
                console.log('🔍 WebSearchTool: Search completed successfully');
                return result;
            } else {
                // Enhanced fallback with better suggestions
                let result = `I wasn't able to retrieve specific search results for "${query}" at the moment.\n\n`;
                result += `Here are some ways to find this information:\n\n`;
                result += `1. **Direct Search**: Try searching "${query}" on:\n`;
                result += `   • Google.com\n`;
                result += `   • DuckDuckGo.com\n`;
                result += `   • Bing.com\n\n`;
                result += `2. **Specific Resources**: For location-based queries like this, try:\n`;
                result += `   • TripAdvisor\n`;
                result += `   • Lonely Planet\n`;
                result += `   • Local tourism websites\n\n`;
                result += `3. **Alternative Tools**: I can also help you:\n`;
                result += `   • Extract content from specific URLs if you have them\n`;
                result += `   • Search through your indexed documents\n`;
                result += `   • Create structured notes for your research\n`;
                
                return result;
            }
            
        } catch (error) {
            console.error('🔍 WebSearchTool: Search failed:', error);
            return `I encountered an error while searching for "${query}". Please try searching directly on your preferred search engine.`;
        }
    }

    private async performSearch(query: string): Promise<SearchResult[]> {
        const results: SearchResult[] = [];
        
        // Try DuckDuckGo instant answers first
        try {
            const ddgResults = await this.searchDuckDuckGo(query);
            results.push(...ddgResults);
        } catch (error) {
            console.log('DuckDuckGo search failed:', error);
        }
        
        // If we don't have enough results, try alternative methods
        if (results.length < 3) {
            try {
                const alternativeResults = await this.searchAlternative(query);
                results.push(...alternativeResults);
            } catch (error) {
                console.log('Alternative search failed:', error);
            }
        }
        
        return results.slice(0, 5); // Limit to top 5 results
    }

    private async searchDuckDuckGo(query: string): Promise<SearchResult[]> {
        const searchUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1&skip_disambig=1`;
        
        const response = await this.makeHttpRequest(searchUrl);
        const data = JSON.parse(response);
        const results: SearchResult[] = [];
        
        // Extract from instant answers
        if (data.Abstract && data.Abstract.trim()) {
            results.push({
                title: data.Heading || 'Summary',
                link: data.AbstractURL || '',
                snippet: data.Abstract
            });
        }
        
        // Extract from related topics
        if (data.RelatedTopics && data.RelatedTopics.length > 0) {
            data.RelatedTopics.slice(0, 3).forEach((topic: any) => {
                if (topic.Text && topic.FirstURL) {
                    // Extract title from text (usually before the first dash or period)
                    const titleMatch = topic.Text.match(/^([^-\.]+)/);
                    const title = titleMatch ? titleMatch[1].trim() : topic.Text.substring(0, 60);
                    
                    results.push({
                        title: title,
                        link: topic.FirstURL,
                        snippet: topic.Text
                    });
                }
            });
        }
        
        return results;
    }

    private async searchAlternative(query: string): Promise<SearchResult[]> {
        try {
            // Use a simple HTML scraping approach for DuckDuckGo Lite (privacy-friendly)
            const searchUrl = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
            const html = await this.makeHttpRequest(searchUrl);
            
            return this.parseSearchResults(html);
        } catch (error) {
            console.log('Alternative search method failed:', error);
            return [];
        }
    }

    private parseSearchResults(html: string): SearchResult[] {
        const results: SearchResult[] = [];
        
        try {
            // Simple regex-based parsing for DuckDuckGo Lite results
            // This is a basic implementation - in production, consider using a proper HTML parser
            const linkRegex = /<a[^>]+href="([^"]*)"[^>]*>([^<]+)<\/a>/gi;
            const snippetRegex = /<td[^>]*class="[^"]*result-snippet[^"]*"[^>]*>([^<]+)<\/td>/gi;
            
            let match;
            let snippets: string[] = [];
            
            // Extract snippets
            while ((match = snippetRegex.exec(html)) !== null) {
                snippets.push(match[1].trim());
            }
            
            let linkIndex = 0;
            // Extract links and titles
            while ((match = linkRegex.exec(html)) !== null && results.length < 5) {
                const url = match[1];
                const title = match[2].trim();
                
                // Filter out internal DuckDuckGo links and ensure we have valid results
                if (url && title && 
                    !url.includes('duckduckgo.com') && 
                    !url.startsWith('/') && 
                    title.length > 5 &&
                    (url.startsWith('http://') || url.startsWith('https://'))) {
                    
                    results.push({
                        title: this.cleanText(title),
                        link: url,
                        snippet: snippets[linkIndex] ? this.cleanText(snippets[linkIndex]) : 'No description available'
                    });
                    
                    linkIndex++;
                }
            }
        } catch (error) {
            console.log('Error parsing search results:', error);
        }
        
        return results;
    }

    private cleanText(text: string): string {
        return text
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/\s+/g, ' ')
            .trim();
    }
    
    private makeHttpRequest(url: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);
            const options = {
                hostname: urlObj.hostname,
                port: urlObj.port || 443,
                path: urlObj.pathname + urlObj.search,
                method: 'GET',
                headers: {
                    'User-Agent': 'Cindy Voice Assistant/1.0'
                }
            };
            
            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    resolve(data);
                });
            });
            
            req.on('error', (error) => {
                reject(error);
            });
            
            req.setTimeout(10000, () => {
                req.abort();
                reject(new Error('Request timeout'));
            });
            
            req.end();
        });
    }
}
