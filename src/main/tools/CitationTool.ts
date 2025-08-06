import { BrowserTool } from './BrowserTool';
import * as fs from 'fs/promises';
import * as path from 'path';
import { app } from 'electron';

interface CitationData {
    title: string;
    authors: string[];
    publication: string;
    publishDate: string;
    url: string;
    accessDate: string;
    doi?: string;
    abstract?: string;
}

interface CitationResult {
    success: boolean;
    citation?: CitationData;
    formatted?: {
        apa: string;
        mla: string;
        chicago: string;
        bibtex: string;
    };
    error?: string;
}

interface CitationOptions {
    format?: 'apa' | 'mla' | 'chicago' | 'bibtex' | 'all';
    includeAbstract?: boolean;
    saveToFile?: boolean;
}

export class CitationTool {
    private browserTool: BrowserTool;
    private citationsDir: string;

    constructor() {
        this.browserTool = new BrowserTool();
        this.citationsDir = path.join(app.getPath('userData'), 'citations');
        this.ensureCitationsDir();
    }

    async extractCitation(url: string, options: CitationOptions = {}): Promise<CitationResult> {
        try {
            // Extract content from the webpage
            const browserResult = await this.browserTool.extractContent(url, { headless: true });

            if (!browserResult.success) {
                return {
                    success: false,
                    error: `Failed to extract content: ${browserResult.error}`
                };
            }

            // Extract citation metadata
            const citationData = await this.extractMetadata(url, browserResult.title || '', browserResult.content || '');

            if (!citationData) {
                return {
                    success: false,
                    error: 'Could not extract citation metadata from the page'
                };
            }

            // Format citations
            const formatted = this.formatCitations(citationData, options.format);

            // Save to file if requested
            if (options.saveToFile) {
                await this.saveCitation(citationData, formatted);
            }

            return {
                success: true,
                citation: citationData,
                formatted
            };

        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to extract citation'
            };
        }
    }

    async createBibliography(urls: string[], options: CitationOptions = {}): Promise<CitationResult[]> {
        const results: CitationResult[] = [];

        for (const url of urls) {
            const result = await this.extractCitation(url, { ...options, saveToFile: false });
            results.push(result);
        }

        // Create combined bibliography file if requested
        if (options.saveToFile) {
            await this.saveBibliography(results, options.format || 'apa');
        }

        return results;
    }

    async saveCitation(citation: CitationData, formatted: any): Promise<string> {
        await this.ensureCitationsDir();

        const filename = `citation_${Date.now()}.json`;
        const filepath = path.join(this.citationsDir, filename);

        const data = {
            citation,
            formatted,
            savedAt: new Date().toISOString()
        };

        await fs.writeFile(filepath, JSON.stringify(data, null, 2), 'utf8');
        return filepath;
    }

    async loadCitations(): Promise<CitationData[]> {
        try {
            await this.ensureCitationsDir();
            const files = await fs.readdir(this.citationsDir);
            const citations: CitationData[] = [];

            for (const file of files) {
                if (file.endsWith('.json')) {
                    try {
                        const filepath = path.join(this.citationsDir, file);
                        const content = await fs.readFile(filepath, 'utf8');
                        const data = JSON.parse(content);
                        if (data.citation) {
                            citations.push(data.citation);
                        }
                    } catch (error) {
                        console.warn(`Failed to load citation file ${file}:`, error);
                    }
                }
            }

            return citations;
        } catch (error) {
            console.error('Failed to load citations:', error);
            return [];
        }
    }

    private async extractMetadata(url: string, title: string, content: string): Promise<CitationData | null> {
        try {
            // Try to extract structured data first (using browser tool)
            const structuredData = await this.extractStructuredData(url);
            if (structuredData) {
                return structuredData;
            }

            // Fallback to heuristic extraction
            return this.extractFromContent(url, title, content);

        } catch (error) {
            console.warn('Metadata extraction failed:', error);
            return null;
        }
    }

    private async extractStructuredData(url: string): Promise<CitationData | null> {
        try {
            // Use browser tool to extract structured data
            const browserResult = await this.browserTool.extractContent(url, { headless: true });

            if (!browserResult.success || !this.browserTool['browserWindow']) {
                return null;
            }

            // Extract metadata from HTML meta tags and JSON-LD
            const metadata = await this.browserTool['browserWindow'].webContents.executeJavaScript(`
                (() => {
                    const meta = {};
                    
                    // Extract meta tags
                    const metaTags = document.querySelectorAll('meta');
                    metaTags.forEach(tag => {
                        const name = tag.getAttribute('name') || tag.getAttribute('property') || tag.getAttribute('itemprop');
                        const content = tag.getAttribute('content');
                        if (name && content) {
                            meta[name] = content;
                        }
                    });
                    
                    // Extract JSON-LD structured data
                    const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
                    const jsonLd = [];
                    jsonLdScripts.forEach(script => {
                        try {
                            jsonLd.push(JSON.parse(script.textContent));
                        } catch (e) {}
                    });
                    
                    // Extract Open Graph data
                    const og = {};
                    metaTags.forEach(tag => {
                        const property = tag.getAttribute('property');
                        const content = tag.getAttribute('content');
                        if (property && property.startsWith('og:') && content) {
                            og[property] = content;
                        }
                    });
                    
                    return { meta, jsonLd, og };
                })();
            `);

            return this.parseStructuredMetadata(url, metadata);

        } catch (error) {
            console.warn('Structured data extraction failed:', error);
            return null;
        }
    }

    private parseStructuredMetadata(url: string, metadata: any): CitationData | null {
        try {
            const { meta, jsonLd, og } = metadata;

            // Try to extract from JSON-LD first
            for (const data of jsonLd) {
                if (data['@type'] === 'Article' || data['@type'] === 'ScholarlyArticle') {
                    return {
                        title: data.headline || data.name || og['og:title'] || meta['title'] || '',
                        authors: this.extractAuthors(data.author),
                        publication: data.publisher?.name || meta['citation_journal_title'] || '',
                        publishDate: data.datePublished || meta['citation_date'] || '',
                        url,
                        accessDate: new Date().toISOString().split('T')[0],
                        doi: data.doi || meta['citation_doi'],
                        abstract: data.description || meta['description'] || og['og:description']
                    };
                }
            }

            // Fallback to meta tags
            const title = og['og:title'] || meta['citation_title'] || meta['title'] || '';
            const authors = meta['citation_author'] ? [meta['citation_author']] :
                meta['author'] ? [meta['author']] : [];

            if (title) {
                return {
                    title,
                    authors,
                    publication: meta['citation_journal_title'] || meta['publication'] || '',
                    publishDate: meta['citation_date'] || meta['publishDate'] || '',
                    url,
                    accessDate: new Date().toISOString().split('T')[0],
                    doi: meta['citation_doi'],
                    abstract: meta['description'] || og['og:description']
                };
            }

            return null;

        } catch (error) {
            console.warn('Failed to parse structured metadata:', error);
            return null;
        }
    }

    private extractFromContent(url: string, title: string, content: string): CitationData {
        // Heuristic extraction from content
        // Try to find publication date
        const dateRegex = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\/\d{4}\b/i;
        const publishDate = content.match(dateRegex)?.[0] || '';

        // Try to extract publication name from URL or content
        const urlParts = new URL(url).hostname.split('.');
        const publication = urlParts.length > 1 ? urlParts[urlParts.length - 2] : urlParts[0];

        return {
            title: title || 'Untitled',
            authors: [], // Would need more sophisticated extraction
            publication: publication || '',
            publishDate,
            url,
            accessDate: new Date().toISOString().split('T')[0],
            abstract: content.substring(0, 500) + (content.length > 500 ? '...' : '')
        };
    }

    private extractAuthors(authorData: any): string[] {
        if (!authorData) return [];

        if (Array.isArray(authorData)) {
            return authorData.map(author => {
                if (typeof author === 'string') return author;
                if (author.name) return author.name;
                if (author.givenName && author.familyName) {
                    return `${author.givenName} ${author.familyName}`;
                }
                return String(author);
            });
        }

        if (typeof authorData === 'string') {
            return [authorData];
        }

        if (authorData.name) {
            return [authorData.name];
        }

        return [];
    }

    private formatCitations(citation: CitationData, format?: string) {
        const formatted: any = {};

        if (!format || format === 'apa' || format === 'all') {
            formatted.apa = this.formatAPA(citation);
        }

        if (!format || format === 'mla' || format === 'all') {
            formatted.mla = this.formatMLA(citation);
        }

        if (!format || format === 'chicago' || format === 'all') {
            formatted.chicago = this.formatChicago(citation);
        }

        if (!format || format === 'bibtex' || format === 'all') {
            formatted.bibtex = this.formatBibTeX(citation);
        }

        return formatted;
    }

    private formatAPA(citation: CitationData): string {
        const authors = citation.authors.length > 0 ? citation.authors.join(', ') : 'Unknown Author';
        const year = citation.publishDate ? new Date(citation.publishDate).getFullYear() : 'n.d.';
        const publication = citation.publication ? `${citation.publication}. ` : '';

        return `${authors} (${year}). ${citation.title}. ${publication}Retrieved ${citation.accessDate}, from ${citation.url}`;
    }

    private formatMLA(citation: CitationData): string {
        const authors = citation.authors.length > 0 ? citation.authors[0] : 'Unknown Author';
        const publication = citation.publication ? `${citation.publication}, ` : '';
        const date = citation.publishDate ? new Date(citation.publishDate).toLocaleDateString() : '';

        return `${authors}. "${citation.title}." ${publication}${date}. Web. ${citation.accessDate}.`;
    }

    private formatChicago(citation: CitationData): string {
        const authors = citation.authors.length > 0 ? citation.authors.join(', ') : 'Unknown Author';
        const publication = citation.publication ? `${citation.publication}. ` : '';
        const date = citation.publishDate ? `${citation.publishDate}. ` : '';

        return `${authors}. "${citation.title}." ${publication}${date}${citation.url} (accessed ${citation.accessDate}).`;
    }

    private formatBibTeX(citation: CitationData): string {
        const key = citation.title.replace(/[^a-zA-Z0-9]/g, '').substring(0, 20);
        const authors = citation.authors.join(' and ');
        const year = citation.publishDate ? new Date(citation.publishDate).getFullYear() : '';

        return `@article{${key},
  title={${citation.title}},
  author={${authors}},
  journal={${citation.publication}},
  year={${year}},
  url={${citation.url}},
  note={Accessed: ${citation.accessDate}}
}`;
    }

    private async saveBibliography(results: CitationResult[], format: string): Promise<void> {
        await this.ensureCitationsDir();

        const filename = `bibliography_${Date.now()}.txt`;
        const filepath = path.join(this.citationsDir, filename);

        const bibliography = results
            .filter(result => result.success && result.formatted)
            .map(result => result.formatted![format] || result.formatted!.apa)
            .join('\n\n');

        await fs.writeFile(filepath, bibliography, 'utf8');
    }

    private async ensureCitationsDir(): Promise<void> {
        try {
            await fs.mkdir(this.citationsDir, { recursive: true });
        } catch (error) {
            // Directory might already exist
        }
    }

    destroy(): void {
        this.browserTool.destroy();
    }
}