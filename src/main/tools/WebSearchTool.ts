export class WebSearchTool {
    constructor() { }

    async execute(query: string): Promise<string> {
        return `Search results for: ${query}`;
    }
}
