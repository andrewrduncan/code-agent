import { CloudLLMProvider, LLMMessage, LLMOptions, StreamingOptions } from '../types/llm-interfaces';
import { StreamProcessor, readStream, parseOpenAIChunk } from './StreamingUtils';

export class OpenAIProvider implements CloudLLMProvider {
    name = 'OpenAI';
    baseUrl = 'https://api.openai.com/v1';
    supportedModels = [
        'gpt-4-turbo-preview',
        'gpt-4',
        'gpt-3.5-turbo',
        'gpt-3.5-turbo-16k'
    ];
    maxContextWindow = 128000; // For gpt-4-turbo-preview
    readonly supportsThinking = false;
    readonly supportsStreaming = true;

    constructor(
        public readonly apiKey: string,
        public readonly organization?: string
    ) {}

    async validateApiKey(): Promise<boolean> {
        try {
            const response = await fetch(`${this.baseUrl}/models`, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    ...(this.organization ? { 'OpenAI-Organization': this.organization } : {})
                }
            });
            return response.ok;
        } catch {
            return false;
        }
    }

    async getRemainingQuota(): Promise<{ requests: number; tokens: number; expiresAt: Date; }> {
        // OpenAI doesn't provide quota info via API
        // You'd need to check the billing dashboard
        throw new Error('Quota information not available via API');
    }

    async chat(messages: LLMMessage[], options?: LLMOptions): Promise<LLMMessage> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
        };

        if (this.organization) {
            headers['OpenAI-Organization'] = this.organization;
        }

        try {
            const response = await fetch(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    model: options?.model || 'gpt-4-turbo-preview',
                    messages: messages.map(m => ({
                        role: m.role,
                        content: m.content
                    })),
                    temperature: options?.temperature || 0.7,
                    max_tokens: options?.max_tokens,
                    stream: false
                }),
            });

            if (!response.ok) {
                throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            return {
                role: 'assistant',
                content: data.choices[0].message.content
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
        const inputs = Array.isArray(text) ? text : [text];
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
        };

        if (this.organization) {
            headers['OpenAI-Organization'] = this.organization;
        }

        try {
            const response = await fetch(`${this.baseUrl}/embeddings`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    model: 'text-embedding-3-small',
                    input: inputs
                }),
            });

            if (!response.ok) {
                throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            return data.data.map((item: any) => item.embedding);
        } catch (error) {
            console.error('Error in embeddings:', error);
            throw error;
        }
    }

    async chatStream(messages: LLMMessage[], options: StreamingOptions): Promise<void> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
            'Accept': 'text/event-stream'
        };

        if (this.organization) {
            headers['OpenAI-Organization'] = this.organization;
        }

        try {
            const response = await fetch(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    model: options?.model || 'gpt-4-turbo-preview',
                    messages: messages.map(m => ({
                        role: m.role,
                        content: m.content
                    })),
                    temperature: options?.temperature || 0.7,
                    max_tokens: options?.max_tokens,
                    stream: true
                }),
                signal: options.abortSignal
            });

            if (!response.ok) {
                throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
            }

            if (!response.body) {
                throw new Error('No response body received');
            }

            const reader = response.body.getReader();
            const processor = new StreamProcessor(options.onToken);

            for await (const chunk of readStream(reader)) {
                const content = parseOpenAIChunk(chunk);
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