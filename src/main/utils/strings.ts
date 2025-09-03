// Write a function that trims <think>...</think> tags from a string, preserving the content inside.

export function trimThinkTags(input: string): string {
    if (!input || typeof input !== 'string') {
        return '';
    }

    return input
        // Remove thinking tags
        .replace(/<think>.*?<\/think>/gs, '')
        // Remove other common XML/HTML tags
        .replace(/<[^>]*>/g, '')
        // Remove extra whitespace
        .replace(/\s+/g, ' ')
        // Trim
        .trim();
}