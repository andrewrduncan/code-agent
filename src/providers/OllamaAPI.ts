import { LLMMessage, ModelInfo, StreamingOptions } from '../types/llm-interfaces';
import { OllamaEvent, OllamaEventEmitter } from '../types/events';
import { 
    OllamaError, 
    OllamaConnectionError, 
    OllamaModelNotFoundError,
    OllamaResponseError 
} from '../types/errors';

export class OllamaAPI {
    constructor(
        private baseUrl: string,
        private eventEmitter: OllamaEventEmitter
    ) {}

    private async fetchWithEvents<T>(
        endpoint: string,
        options: RequestInit,
        successEvent?: OllamaEvent,
        errorEvent?: Partial<OllamaEvent>
    ): Promise<T> {
        try {
            const response = await fetch(`${this.baseUrl}/api/${endpoint}`, {
                ...options,
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                
                if (response.status === 404) {
                    if (errorText.includes('model') && errorText.includes('not found')) {
                        throw new OllamaModelNotFoundError(
                            JSON.parse(options.body as string).model || 'unknown',
                            []  // Will be populated by caller
                        );
                    }
                    throw new OllamaConnectionError(this.baseUrl);
                }
                
                throw new OllamaError(`${response.status} ${response.statusText}\n${errorText}`);
            }

            const data = await response.json();
            
            if (successEvent) {
                this.eventEmitter.emit(successEvent);
            }
            
            return data as T;
        } catch (error) {
            if (error instanceof TypeError && error.message.includes('fetch')) {
                throw new OllamaConnectionError(this.baseUrl);
            }
            
            if (errorEvent) {
                this.eventEmitter.emit({
                    type: errorEvent.type!,
                    error: error as Error,
                    ...errorEvent
                });
            }
            
            throw error;
        }
    }

    async listModels(): Promise<ModelInfo[]> {
        const data = await this.fetchWithEvents<{ models: any[] }>(
            'tags',
            { method: 'GET' },
            { type: 'models:loaded' },
            { type: 'models:error' }
        );

        return data.models.map(model => ({
            id: model.digest,
            name: model.name,
            parameters: parseInt(model.details?.parameter_size || '0'),
            format: (model.details?.format || 'gguf') as any,
            size: model.size,
            lastModified: new Date(model.modified_at),
            quantization: model.details?.quantization_level
        }));
    }

    async chat(model: string, messages: LLMMessage[], options: StreamingOptions): Promise<ReadableStreamDefaultReader<Uint8Array>> {
        try {
            const response = await fetch(`${this.baseUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model,
                    messages,
                    stream: true,
                    system: "Before providing your response, you MUST show your thinking process by wrapping it in <think> tags. For example: <think>Let me analyze this...</think> followed by your actual response. This helps users understand your reasoning process.",
                    options: {
                        temperature: options.temperature || 0.7,
                        num_predict: options.max_tokens,
                        top_p: options.top_p || 0.9,
                        raw_response: false,
                        seed: -1
                    },
                    ...options
                }),
                signal: options.abortSignal
            });

            if (!response.ok) {
                const errorText = await response.text();
                
                if (response.status === 404) {
                    if (errorText.includes('model') && errorText.includes('not found')) {
                        throw new OllamaModelNotFoundError(model, []);
                    }
                    throw new OllamaConnectionError(this.baseUrl);
                }
                
                throw new OllamaError(`${response.status} ${response.statusText}\n${errorText}`);
            }

            if (!response.body) {
                throw new OllamaResponseError('No response body received');
            }

            return response.body.getReader();
        } catch (error) {
            if (error instanceof TypeError && error.message.includes('fetch')) {
                throw new OllamaConnectionError(this.baseUrl);
            }
            if (error instanceof OllamaError) {
                throw error;
            }
            throw new OllamaError(error instanceof Error ? error.message : String(error));
        }
    }

    async pullModel(modelId: string): Promise<ReadableStreamDefaultReader<Uint8Array>> {
        try {
            const response = await fetch(`${this.baseUrl}/api/pull`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: modelId })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new OllamaError(`Failed to pull model: ${response.status} ${response.statusText}\n${errorText}`);
            }

            if (!response.body) {
                throw new OllamaResponseError('No response body available');
            }

            return response.body.getReader();
        } catch (error) {
            if (error instanceof TypeError && error.message.includes('fetch')) {
                throw new OllamaConnectionError(this.baseUrl);
            }
            if (error instanceof OllamaError) {
                throw error;
            }
            throw new OllamaError(error instanceof Error ? error.message : String(error));
        }
    }

    async deleteModel(modelId: string): Promise<void> {
        await this.fetchWithEvents(
            'delete',
            {
                method: 'DELETE',
                body: JSON.stringify({ name: modelId })
            }
        );
    }

    async getModelInfo(modelId: string): Promise<ModelInfo> {
        const data = await this.fetchWithEvents<any>(
            'show',
            {
                method: 'POST',
                body: JSON.stringify({ name: modelId })
            }
        );

        return {
            id: data.digest,
            name: modelId,
            parameters: parseInt(data.details?.parameter_size || '0'),
            format: (data.details?.format || 'gguf') as any,
            size: data.size,
            lastModified: new Date(data.modified_at),
            quantization: data.details?.quantization_level,
            license: data.license,
            creator: data.details?.family
        };
    }

    async copyModel(sourceId: string, targetId: string): Promise<void> {
        await this.fetchWithEvents(
            'copy',
            {
                method: 'POST',
                body: JSON.stringify({
                    source: sourceId,
                    destination: targetId
                })
            }
        );
    }

    async embeddings(model: string, text: string | string[]): Promise<number[][]> {
        const inputs = Array.isArray(text) ? text : [text];
        const data = await this.fetchWithEvents<{ embedding: number[] }>(
            'embeddings',
            {
                method: 'POST',
                body: JSON.stringify({
                    model,
                    prompt: inputs[0] // Currently Ollama only supports single input
                })
            }
        );
        return [data.embedding];
    }
} 