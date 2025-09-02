// Write a function that trims <think>...</think> tags from a string, preserving the content inside.

export function trimThinkTags(input: string): string {
    return input.replace(/<think>(.*?)<\/think>/gs, '$1').trim();
}