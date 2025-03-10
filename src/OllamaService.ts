import * as vscode from 'vscode';
import { ModelManager } from './ModelManager';

interface OllamaResponse {
    message: {
        role: string;
        content: string;
    };
}

export class OllamaService {
    private modelManager?: ModelManager;

    constructor() {}

    private getConfig() {
        const config = vscode.workspace.getConfiguration('codeAgent');
        return {
            host: config.get('ollamaHost') as string,
            port: config.get('ollamaPort') as number,
            model: config.get('model') as string
        };
    }

    async initialize() {
        const config = this.getConfig();
        try {
            this.modelManager = await ModelManager.initialize(config.host, config.port);
            
            // If no model is set or current model isn't available, set a valid one
            if (!config.model || !(await this.modelManager.checkModelAvailability(config.model))) {
                const model = await this.modelManager.ensureModelAvailable();
                await vscode.workspace.getConfiguration('codeAgent').update('model', model, true);
            }
        } catch (error) {
            console.error('Failed to initialize OllamaService:', error);
            throw error;
        }
    }

    async getAvailableModels(): Promise<string[]> {
        if (!this.modelManager) {
            throw new Error('OllamaService not initialized');
        }
        return this.modelManager.getAvailableModels();
    }

    async chat(messages: Array<{ role: string; content: string }>, options?: { onThinking?: (thought: string) => void }) {
        if (!this.modelManager) {
            throw new Error('OllamaService not initialized');
        }

        const config = this.getConfig();
        const url = `http://${config.host}:${config.port}/api/chat`;

        console.log('Sending request to Ollama API:', {
            url,
            model: config.model,
            messageCount: messages.length
        });

        try {
            // Ensure model is available before sending request
            await this.modelManager.ensureModelAvailable(config.model);

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: config.model,
                    messages: messages,
                    stream: true,
                    system: "Before providing your response, you MUST show your thinking process by wrapping it in <think> tags. For example: <think>Let me analyze this...</think> followed by your actual response. This helps users understand your reasoning process."
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Ollama API error:', {
                    status: response.status,
                    statusText: response.statusText,
                    body: errorText
                });
                throw new Error(`Ollama API error: ${response.status} ${response.statusText}\n${errorText}`);
            }

            if (!response.body) {
                throw new Error('No response body received');
            }

            const reader = response.body.getReader();
            let content = '';
            let lastThinkingContent = '';
            
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    
                    const chunk = new TextDecoder().decode(value);
                    const lines = chunk.split('\n').filter(line => line.trim());
                    
                    for (const line of lines) {
                        try {
                            const data = JSON.parse(line);
                            if (data.message?.content) {
                                content += data.message.content;
                                
                                // Extract thinking content
                                const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/);
                                if (thinkMatch && thinkMatch[1] !== lastThinkingContent) {
                                    lastThinkingContent = thinkMatch[1];
                                    if (options?.onThinking) {
                                        options.onThinking(lastThinkingContent);
                                    }
                                }
                            }
                        } catch (e) {
                            console.warn('Error parsing chunk:', e);
                        }
                    }
                }
            } finally {
                reader.releaseLock();
            }

            // Clean up the final content by removing thinking tags
            const finalContent = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

            return {
                role: 'assistant',
                content: finalContent
            };
        } catch (error) {
            if (error instanceof TypeError && error.message.includes('fetch')) {
                console.error('Network error connecting to Ollama:', error);
                throw new Error(`Failed to connect to Ollama at ${url}. Please check if Ollama is running and the host/port settings are correct.`);
            }
            console.error('Error calling Ollama API:', error);
            throw error;
        }
    }
} 