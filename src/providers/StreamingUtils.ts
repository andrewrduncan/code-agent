import { StreamingCallback, StreamingResponse } from '../types/llm-interfaces';

export class StreamProcessor {
    private accumulatedText = '';
    private lastThinkingUpdate = '';

    constructor(private callback: StreamingCallback) {}

    processChunk(chunk: string, isDone: boolean = false) {
        // Only add non-empty chunks to avoid clearing content
        if (chunk) {
            this.accumulatedText += chunk;
        }
        
        // Extract and clean up thinking content
        let cleanedText = this.accumulatedText;
        let latestThought = '';
        
        // Handle nested thinking tags by recursively extracting the innermost content
        while (cleanedText.includes('<think>')) {
            const thinkingMatch = cleanedText.match(/<think>(.*?)<\/think>/s);
            if (thinkingMatch) {
                latestThought = thinkingMatch[1].trim();
                // Remove the matched thinking tag and its content
                cleanedText = cleanedText.replace(/<think>.*?<\/think>/s, '').trim();
            } else {
                break;
            }
        }
        
        // Only send thinking update if it's different from the last one
        if (latestThought && latestThought !== this.lastThinkingUpdate) {
            this.lastThinkingUpdate = latestThought;
            this.callback({
                content: cleanedText,
                isDone: false,
                thinking: latestThought
            });
        }

        // Only send content update if we have content or we're done
        if (cleanedText || isDone) {
            this.callback({
                content: cleanedText,
                isDone
            });
        }
    }

    processError(error: string) {
        // Clean up any thinking tags in the accumulated text
        const cleanedText = this.accumulatedText.replace(/<think>.*?<\/think>/gs, '').trim();
        this.callback({
            content: cleanedText,
            isDone: true,
            error
        });
    }
}

export async function* readStream(reader: ReadableStreamDefaultReader<Uint8Array>): AsyncGenerator<string> {
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            yield new TextDecoder().decode(value);
        }
    } finally {
        reader.releaseLock();
    }
}

export function parseOpenAIChunk(chunk: string): string {
    try {
        const lines = chunk.split('\n').filter(line => line.trim() && line.startsWith('data: '));
        let content = '';
        
        for (const line of lines) {
            const data = JSON.parse(line.slice(6)); // Remove 'data: ' prefix
            if (data.choices?.[0]?.delta?.content) {
                content += data.choices[0].delta.content;
            }
        }
        
        return content;
    } catch (e) {
        console.warn('Error parsing OpenAI chunk:', e);
        return '';
    }
}

export function parseAnthropicChunk(chunk: string): string {
    try {
        const lines = chunk.split('\n').filter(line => line.trim());
        let content = '';
        
        for (const line of lines) {
            const data = JSON.parse(line);
            if (data.type === 'content_block_delta' && data.delta?.text) {
                content += data.delta.text;
            }
        }
        
        return content;
    } catch (e) {
        console.warn('Error parsing Anthropic chunk:', e);
        return '';
    }
} 