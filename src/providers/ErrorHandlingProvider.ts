import * as vscode from 'vscode';
import { BaseLLMProvider, LLMMessage, LLMOptions, StreamingOptions } from '../types/llm-interfaces';

export class ErrorHandlingProvider implements BaseLLMProvider {
    constructor(private provider: BaseLLMProvider) {}

    get name() { return this.provider.name; }
    get baseUrl() { return this.provider.baseUrl; }
    get supportedModels() { return this.provider.supportedModels; }
    get maxContextWindow() { return this.provider.maxContextWindow; }
    get supportsStreaming() { return this.provider.supportsStreaming; }

    private handleError(error: any, operation: string): never {
        console.error(`Error in ${operation}:`, error);
        
        let message: string;
        if (error instanceof Error) {
            message = error.message;
        } else if (typeof error === 'string') {
            message = error;
        } else {
            message = 'An unexpected error occurred';
        }

        // Network-specific error detection
        if (error instanceof TypeError && error.message === 'Failed to fetch') {
            message = `Cannot connect to ${this.name}. Please check if the service is running and accessible.`;
        } else if (error.name === 'AbortError') {
            message = 'The operation was cancelled due to timeout.';
        } else if (error instanceof Response || (error as any).status) {
            const status = (error as any).status;
            switch (status) {
                case 401:
                    message = `Authentication failed with ${this.name}. Please check your API key or credentials.`;
                    break;
                case 403:
                    message = `Access denied to ${this.name}. Please check your permissions.`;
                    break;
                case 429:
                    message = `Rate limit exceeded for ${this.name}. Please try again later.`;
                    break;
                case 500:
                case 502:
                case 503:
                case 504:
                    message = `${this.name} service is currently unavailable. Please try again later.`;
                    break;
                default:
                    message = `Error communicating with ${this.name}: ${message}`;
            }
        }

        // Show error notification
        vscode.window.showErrorMessage(message);
        
        throw error;
    }

    async chat(messages: LLMMessage[], options?: LLMOptions): Promise<LLMMessage> {
        try {
            return await this.provider.chat(messages, options);
        } catch (error) {
            return this.handleError(error, 'chat');
        }
    }

    async generate(prompt: string, options?: LLMOptions): Promise<string> {
        try {
            return await this.provider.generate(prompt, options);
        } catch (error) {
            return this.handleError(error, 'generate');
        }
    }

    async embeddings(text: string | string[]): Promise<number[][]> {
        try {
            return await this.provider.embeddings(text);
        } catch (error) {
            return this.handleError(error, 'embeddings');
        }
    }

    async chatStream(messages: LLMMessage[], options: StreamingOptions): Promise<void> {
        try {
            return await this.provider.chatStream(messages, options);
        } catch (error) {
            return this.handleError(error, 'chatStream');
        }
    }

    async generateStream(prompt: string, options: StreamingOptions): Promise<void> {
        try {
            return await this.provider.generateStream(prompt, options);
        } catch (error) {
            return this.handleError(error, 'generateStream');
        }
    }
} 