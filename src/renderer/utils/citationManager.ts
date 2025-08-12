/**
 * CitationManager.ts
 * 
 * Utility for managing citations in AI responses.
 * Handles extraction of citations from tool results and insertion into generated text.
 */

export interface Citation {
    id: string;
    title: string;
    url: string;
    snippet?: string;
    source?: string;
    toolCall?: string; // Which tool generated this citation
    timestamp?: number;
}

export interface CitationResult {
    text: string;
    citations: Citation[];
}

export class CitationManager {
    private static instance: CitationManager;
    private citations: Map<string, Citation> = new Map();
    private citationCounter: number = 0;

    private constructor() {}

    public static getInstance(): CitationManager {
        if (!CitationManager.instance) {
            CitationManager.instance = new CitationManager();
        }
        return CitationManager.instance;
    }

    /**
     * Reset citations for a new conversation or message
     */
    public reset(): void {
        this.citations.clear();
        this.citationCounter = 0;
    }

    /**
     * Extract citations from tool results
     */
    public extractCitationsFromToolResult(toolName: string, result: any): Citation[] {
        const citations: Citation[] = [];

        try {
            if (toolName === 'web_search' || toolName === 'brave_search') {
                citations.push(...this.extractWebSearchCitations(result, toolName));
            } else if (toolName === 'search_documents') {
                citations.push(...this.extractDocumentSearchCitations(result, toolName));
            }
            // Add more tool types as needed
        } catch (error) {
            console.error('[CitationManager] Error extracting citations:', error);
        }

        return citations;
    }

    /**
     * Extract citations from web search results
     */
    private extractWebSearchCitations(result: any, toolName: string): Citation[] {
        const citations: Citation[] = [];

        try {
            // Handle string results (formatted search results)
            if (typeof result === 'string') {
                const lines = result.split('\n');
                let currentCitation: Partial<Citation> | null = null;

                for (const line of lines) {
                    // Look for numbered results: "1. **Title**"
                    const titleMatch = line.match(/^\d+\.\s*\*\*(.+?)\*\*/);
                    if (titleMatch) {
                        // Save previous citation if exists
                        if (currentCitation && currentCitation.title && currentCitation.url) {
                            citations.push(this.createCitation(currentCitation, toolName));
                        }
                        
                        currentCitation = {
                            title: titleMatch[1].trim()
                        };
                    }
                    
                    // Look for URLs: "   URL: https://..."
                    const urlMatch = line.match(/^\s*URL:\s*(.+)$/);
                    if (urlMatch && currentCitation) {
                        currentCitation.url = urlMatch[1].trim();
                    }
                    
                    // Look for description/snippet
                    const descMatch = line.match(/^\s{3}([^U].+)$/); // Content that starts with 3 spaces but not "URL:"
                    if (descMatch && currentCitation && !currentCitation.snippet) {
                        currentCitation.snippet = descMatch[1].trim();
                    }
                }

                // Don't forget the last citation
                if (currentCitation && currentCitation.title && currentCitation.url) {
                    citations.push(this.createCitation(currentCitation, toolName));
                }
            }
            // Handle structured results
            else if (result?.results && Array.isArray(result.results)) {
                for (const item of result.results) {
                    if (item.title && item.url) {
                        citations.push(this.createCitation({
                            title: item.title,
                            url: item.url,
                            snippet: item.description || item.snippet
                        }, toolName));
                    }
                }
            }
        } catch (error) {
            console.error('[CitationManager] Error parsing web search results:', error);
        }

        return citations;
    }

    /**
     * Extract citations from document search results
     */
    private extractDocumentSearchCitations(result: any, toolName: string): Citation[] {
        const citations: Citation[] = [];

        try {
            if (result?.documents && Array.isArray(result.documents)) {
                for (const doc of result.documents) {
                    if (doc.title || doc.filename) {
                        citations.push(this.createCitation({
                            title: doc.title || doc.filename,
                            url: doc.path || `file://${doc.filename}`,
                            snippet: doc.content ? doc.content.substring(0, 150) : undefined
                        }, toolName));
                    }
                }
            }
        } catch (error) {
            console.error('[CitationManager] Error parsing document search results:', error);
        }

        return citations;
    }

    /**
     * Create a citation with a unique ID
     */
    private createCitation(citation: Partial<Citation>, toolName: string): Citation {
        const id = `cite-${++this.citationCounter}`;
        const fullCitation: Citation = {
            id,
            title: citation.title || 'Unknown Title',
            url: citation.url || '',
            snippet: citation.snippet,
            source: this.getSourceFromUrl(citation.url),
            toolCall: toolName,
            timestamp: Date.now()
        };

        this.citations.set(id, fullCitation);
        return fullCitation;
    }

    /**
     * Get a readable source name from URL
     */
    private getSourceFromUrl(url?: string): string {
        if (!url) return 'Unknown Source';
        
        try {
            const urlObj = new URL(url);
            return urlObj.hostname.replace('www.', '');
        } catch {
            return url.length > 50 ? url.substring(0, 50) + '...' : url;
        }
    }

    /**
     * Insert citations into text
     * This method looks for statements that should be cited and adds citation markers
     */
    public insertCitationsIntoText(text: string, toolResults: Record<string, any>): CitationResult {
        let processedText = text;
        const usedCitations: Citation[] = [];

        try {
            // Collect all citations from tool results
            const allCitations: Citation[] = [];
            for (const [toolName, result] of Object.entries(toolResults)) {
                if (result?.success) {
                    const toolCitations = this.extractCitationsFromToolResult(toolName, result.result);
                    allCitations.push(...toolCitations);
                }
            }

            // Simple citation insertion strategy:
            // Look for sentences that likely came from search results and add citations
            if (allCitations.length > 0) {
                // Split text into sentences
                const sentences = processedText.split(/(?<=[.!?])\s+/);
                const processedSentences: string[] = [];

                for (let i = 0; i < sentences.length; i++) {
                    let sentence = sentences[i];
                    
                    // Skip very short sentences or those that are questions
                    if (sentence.length < 20 || sentence.includes('?')) {
                        processedSentences.push(sentence);
                        continue;
                    }

                    // Try to find a relevant citation for this sentence
                    const relevantCitation = this.findRelevantCitation(sentence, allCitations, usedCitations);
                    
                    if (relevantCitation && !usedCitations.find(c => c.id === relevantCitation.id)) {
                        // Add citation marker
                        sentence = sentence.trim();
                        if (!sentence.endsWith('.')) sentence += '.';
                        sentence += ` [${relevantCitation.id}]`;
                        usedCitations.push(relevantCitation);
                    }

                    processedSentences.push(sentence);
                }

                processedText = processedSentences.join(' ');
            }
        } catch (error) {
            console.error('[CitationManager] Error inserting citations:', error);
        }

        return {
            text: processedText,
            citations: usedCitations
        };
    }

    /**
     * Find a relevant citation for a sentence
     */
    private findRelevantCitation(sentence: string, availableCitations: Citation[], usedCitations: Citation[]): Citation | null {
        // Simple relevance matching - look for common words
        const sentenceWords = sentence.toLowerCase().split(/\s+/)
            .filter(word => word.length > 3) // Filter out short words
            .map(word => word.replace(/[^\w]/g, '')); // Remove punctuation

        let bestMatch: Citation | null = null;
        let bestScore = 0;

        for (const citation of availableCitations) {
            // Skip already used citations
            if (usedCitations.find(c => c.id === citation.id)) continue;

            let score = 0;
            const citationText = (citation.title + ' ' + (citation.snippet || '')).toLowerCase();

            for (const word of sentenceWords) {
                if (citationText.includes(word)) {
                    score++;
                }
            }

            if (score > bestScore) {
                bestScore = score;
                bestMatch = citation;
            }
        }

        // Only return if we have a reasonable match (at least 2 words in common)
        return bestScore >= 2 ? bestMatch : null;
    }

    /**
     * Get all citations
     */
    public getAllCitations(): Citation[] {
        return Array.from(this.citations.values());
    }

    /**
     * Get citation by ID
     */
    public getCitation(id: string): Citation | undefined {
        return this.citations.get(id);
    }

    /**
     * Format citations for display
     */
    public formatCitationsForDisplay(citations: Citation[]): string {
        if (citations.length === 0) return '';

        let formatted = '\n\n**Sources:**\n\n';
        
        for (const citation of citations) {
            formatted += `**[${citation.id}]** [${citation.title}](${citation.url})`;
            if (citation.source) {
                formatted += ` - *${citation.source}*`;
            }
            formatted += '\n\n';
        }

        return formatted;
    }
}

// Export singleton instance
export const citationManager = CitationManager.getInstance();