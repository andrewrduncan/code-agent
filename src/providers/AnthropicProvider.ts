import { CloudLLMProvider, LLMMessage, LLMOptions, StreamingOptions } from '../types/llm-interfaces';
import { StreamProcessor, readStream, parseAnthropicChunk } from './StreamingUtils';

export class AnthropicProvider implements CloudLLMProvider {
    name = 'Anthropic';
    baseUrl = 'https://api.anthropic.com/v1';
    supportedModels = [
        'claude-3-opus-20240229',
        'claude-3-sonnet-20240229',
        'claude-3-haiku-20240307',
        'claude-2.1',
        'claude-2.0'
    ];
    maxContextWindow = 200000; // For claude-3-opus
    readonly supportsThinking = false;
    readonly supportsStreaming = true;

    constructor(
        public readonly apiKey: string,
        public readonly organization?: string
    ) {}

    async validateApiKey(): Promise<boolean> {
        try {
            const response = await fetch(`${this.baseUrl}/messages`, {
                method: 'POST',
                headers: {
                    'x-api-key': this.apiKey,
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify({
                    model: 'claude-3-haiku-20240307',
                    messages: [{ role: 'user', content: 'test' }],
                    max_tokens: 1
                })
            });
            return response.ok;
        } catch {
            return false;
        }
    }

    async getRemainingQuota(): Promise<{ requests: number; tokens: number; expiresAt: Date; }> {
        // Anthropic doesn't provide quota info via API
        throw new Error('Quota information not available via API');
    }

    async chat(messages: LLMMessage[], options?: LLMOptions): Promise<LLMMessage> {
        try {
            const response = await fetch(`${this.baseUrl}/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': this.apiKey,
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify({
                    model: options?.model || 'claude-3-opus-20240229',
                    messages: messages.map(m => ({
                        role: m.role === 'user' ? 'user' : 'assistant',
                        content: m.content
                    })),
                    temperature: options?.temperature || 0.7,
                    max_tokens: options?.max_tokens,
                    stream: false
                }),
            });

            if (!response.ok) {
                throw new Error(`Anthropic API error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            return {
                role: 'assistant',
                content: data.content[0].text
            };
        } catch (error) {
            console.error('Error in chat:', error);
            throw error;
        }
    }

    async generate(prompt: string, options?: LLMOptions): Promise<string> {
        const response = await this.chat([{ role: 'user', content: prompt }], options);
        return response.content;
    }

    async embeddings(text: string | string[]): Promise<number[][]> {
        // Note: Anthropic doesn't currently have a public embeddings API
        // This is a placeholder that throws an error
        throw new Error('Embeddings are not supported by the Anthropic API');
    }

    async chatStream(messages: LLMMessage[], options: StreamingOptions): Promise<void> {
        try {
            const response = await fetch(`${this.baseUrl}/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': this.apiKey,
                    'anthropic-version': '2023-06-01',
                    'Accept': 'text/event-stream'
                },
                body: JSON.stringify({
                    model: options?.model || 'claude-3-opus-20240229',
                    messages: messages.map(m => ({
                        role: m.role === 'user' ? 'user' : 'assistant',
                        content: m.content
                    })),
                    temperature: options?.temperature || 0.7,
                    max_tokens: options?.max_tokens,
                    stream: true
                }),
                signal: options.abortSignal
            });

            if (!response.ok) {
                throw new Error(`Anthropic API error: ${response.status} ${response.statusText}`);
            }

            if (!response.body) {
                throw new Error('No response body received');
            }

            const reader = response.body.getReader();
            const processor = new StreamProcessor(options.onToken);

            for await (const chunk of readStream(reader)) {
                const content = parseAnthropicChunk(chunk);
                if (content) {
                    processor.processChunk(content);
                }
            }

            processor.processChunk('', true); // Mark as done
        } catch (error) {
            console.error('Error in chatStream:', error);
            throw error;
        }
    }

    async generateStream(prompt: string, options: StreamingOptions): Promise<void> {
        return this.chatStream([{ role: 'user', content: prompt }], options);
    }
} 