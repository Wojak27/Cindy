import https from 'https';
import { URL } from 'url';

export class WebSearchTool {
    constructor() { }

    async execute(query: string): Promise<string> {
        try {
            console.log('🔍 WebSearchTool: Performing web search for:', query);
            
            // Use DuckDuckGo's instant answer API as a simple search option
            const searchUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1&skip_disambig=1`;
            
            const response = await this.makeHttpRequest(searchUrl);
            const data = JSON.parse(response);
            
            // Format the response
            let result = `Search results for "${query}":\n\n`;
            
            if (data.Abstract && data.Abstract.trim()) {
                result += `Summary: ${data.Abstract}\n`;
                if (data.AbstractSource) {
                    result += `Source: ${data.AbstractSource}\n`;
                }
                if (data.AbstractURL) {
                    result += `More info: ${data.AbstractURL}\n`;
                }
                result += '\n';
            }
            
            if (data.Answer && data.Answer.trim()) {
                result += `Direct Answer: ${data.Answer}\n`;
                if (data.AnswerType) {
                    result += `Answer Type: ${data.AnswerType}\n`;
                }
                result += '\n';
            }
            
            if (data.RelatedTopics && data.RelatedTopics.length > 0) {
                result += 'Related Topics:\n';
                data.RelatedTopics.slice(0, 3).forEach((topic: any, index: number) => {
                    if (topic.Text) {
                        result += `${index + 1}. ${topic.Text}\n`;
                        if (topic.FirstURL) {
                            result += `   Link: ${topic.FirstURL}\n`;
                        }
                    }
                });
            }
            
            if (result === `Search results for "${query}":\n\n`) {
                // Fallback if no meaningful results
                result += 'No specific results found from DuckDuckGo instant answers.\n';
                result += 'For more comprehensive results, try searching directly on:\n';
                result += '• Google.com\n';
                result += '• DuckDuckGo.com\n';
                result += '• Bing.com\n';
            }
            
            console.log('🔍 WebSearchTool: Search completed successfully');
            return result;
            
        } catch (error) {
            console.error('🔍 WebSearchTool: Search failed:', error);
            return `I encountered an error while searching for "${query}". Please try searching directly on your preferred search engine.`;
        }
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
