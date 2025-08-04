export class WebCrawlTool {
    constructor() { }

    async execute(url: string): Promise<string> {
        return `Crawled content from: ${url}`;
    }
}
