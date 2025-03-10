import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { 
    SelfHostedLLMProvider, 
    LLMMessage, 
    LLMOptions, 
    ModelInfo, 
    ModelStatus,
    ModelRunOptions,
    ModelConfig,
    SystemResources,
    ProgressCallback,
    ProgressInfo,
    StreamingOptions,
    StreamingResponse
} from '../types/llm-interfaces';
import { StreamProcessor, readStream } from './StreamingUtils';
import { OllamaStateManager } from './OllamaStateManager';
import { OllamaAPI } from './OllamaAPI';
import { OllamaStreamProcessor } from './OllamaStreamProcessor';
import { OllamaError, OllamaModelNotFoundError } from '../types/errors';

interface OllamaModel {
    name: string;
    size: number;
    digest: string;
    modified_at: string;
    details?: {
        format: string;
        family: string;
        parameter_size: string;
        quantization_level: string;
    };
}

interface OllamaModelList {
    models: OllamaModel[];
}

export class OllamaProvider implements SelfHostedLLMProvider {
    name = 'Ollama';
    baseUrl: string;
    private api: OllamaAPI;
    private stateManager: OllamaStateManager;
    maxContextWindow = 8192;
    readonly supportsProgress = true;
    readonly supportsStreaming = true;

    constructor(host: string = 'localhost', port: number = 11434) {
        this.baseUrl = `http://${host}:${port}`;
        this.stateManager = new OllamaStateManager();
        this.api = new OllamaAPI(this.baseUrl, this.stateManager);
        // Initialize models state immediately and handle errors
        this.initializeModels();
    }

    private async initializeModels(): Promise<void> {
        try {
            await this.updateSupportedModels();
        } catch (error) {
            console.error('Failed to initialize models:', error);
            // Don't throw here - we want the provider to still be usable
            // The error will be in the state for the UI to handle
        }
    }

    get supportedModels(): string[] {
        const state = this.stateManager.getState();
        return state?.models?.availableModels?.map(m => m.name) || [];
    }

    private async updateSupportedModels(): Promise<void> {
        this.stateManager.emit({ type: 'models:loading' });
        try {
            const models = await this.api.listModels();
            this.stateManager.emit({ 
                type: 'models:loaded', 
                payload: models
            });
        } catch (error) {
            this.stateManager.emit({ 
                type: 'models:error', 
                error: error as Error 
            });
            throw error;
        }
    }

    async chat(messages: LLMMessage[], options?: LLMOptions): Promise<LLMMessage> {
        this.stateManager.emit({ type: 'chat:start' });

        try {
            const model = await this.getCurrentModel();
            const streamProcessor = new OllamaStreamProcessor(this.stateManager, {
                onToken: () => {},
                ...options
            });
            const reader = await this.api.chat(model, messages, {
                onToken: () => {},
                ...options
            });
            const content = await streamProcessor.processStream(reader);
            
            this.stateManager.emit({ type: 'chat:complete' });
            
            return {
                role: 'assistant',
                content
            };
        } catch (error) {
            this.stateManager.emit({
                type: 'chat:error',
                error: error as Error
            });
            throw error;
        }
    }

    async generate(prompt: string, options?: LLMOptions): Promise<string> {
        return (await this.chat([{ role: 'user', content: prompt }], options)).content;
    }

    async embeddings(text: string | string[]): Promise<number[][]> {
        const model = await this.getCurrentModel();
        return this.api.embeddings(model, text);
    }

    // Model Management
    async listModels(): Promise<ModelInfo[]> {
        return this.api.listModels();
    }

    async pullModel(modelId: string): Promise<void> {
        const streamProcessor = new OllamaStreamProcessor(this.stateManager, {
            onToken: () => {}
        });
        const reader = await this.api.pullModel(modelId);
        await streamProcessor.processModelPull(reader);
    }

    async deleteModel(modelId: string): Promise<void> {
        await this.api.deleteModel(modelId);
    }

    async getModelInfo(modelId: string): Promise<ModelInfo> {
        return this.api.getModelInfo(modelId);
    }

    async getModelStatus(modelId: string): Promise<ModelStatus> {
        try {
            await this.generate('test', { max_tokens: 1 });
            return {
                isRunning: true,
                memoryUsage: 0,
                uptime: 0
            };
        } catch {
            return {
                isRunning: false,
                memoryUsage: 0,
                errors: ['Model not loaded or unavailable']
            };
        }
    }

    // Runtime Management
    async startModel(modelId: string): Promise<void> {
        await this.pullModel(modelId);
    }

    async stopModel(): Promise<void> {
        // Ollama handles this automatically
    }

    async restartModel(modelId: string): Promise<void> {
        await this.pullModel(modelId);
    }

    async updateModelConfig(): Promise<void> {
        throw new Error('Runtime configuration updates not supported by Ollama');
    }

    async getSystemResources(): Promise<SystemResources> {
        return {
            cpuCount: navigator.hardwareConcurrency || 1,
            cpuUsage: 0,
            totalMemory: 0,
            usedMemory: 0
        };
    }

    private async getCurrentModel(): Promise<string> {
        const state = this.stateManager.getState();
        if (!state?.models?.availableModels || state.models.availableModels.length === 0) {
            // Try to load models if we don't have any
            await this.updateSupportedModels();
        }

        // Get the current state after potential update
        const currentState = this.stateManager.getState();
        if (!currentState?.models?.availableModels) {
            throw new OllamaModelNotFoundError('any', []);
        }

        const config = vscode.workspace.getConfiguration('codeAgent');
        const configuredModel = config.get('model') as string;
        
        let selectedModel: string;
        const availableModels = currentState.models.availableModels.map(m => m.name);
        
        if (configuredModel && availableModels.includes(configuredModel.split(/[:@]/)[0])) {
            selectedModel = configuredModel;
        } else if (availableModels.length > 0) {
            selectedModel = availableModels[0];
        } else {
            throw new OllamaModelNotFoundError('any', availableModels);
        }

        this.stateManager.emit({
            type: 'model:selected',
            payload: selectedModel
        });
        
        return selectedModel;
    }

    async setCurrentModel(modelId: string): Promise<void> {
        // First update the configuration
        await vscode.workspace.getConfiguration('codeAgent').update('model', modelId, true);
        
        // Then ensure we have the current model list
        const state = this.stateManager.getState();
        if (!state?.models?.availableModels || state.models.availableModels.length === 0) {
            await this.updateSupportedModels();
        }

        // Emit the model selected event
        this.stateManager.emit({
            type: 'model:selected',
            payload: modelId
        });
    }

    async chatStream(messages: LLMMessage[], options: StreamingOptions): Promise<void> {
        const model = await this.getCurrentModel();

        try {
            const reader = await this.api.chat(model, messages, {
                ...options,
                onThinking: (thought) => {
                    if (options.onThinking) {
                        options.onThinking(thought);
                    }
                    this.stateManager.emit({
                        type: 'chat:thinking',
                        payload: thought
                    });
                }
            });
            const streamProcessor = new OllamaStreamProcessor(this.stateManager, options);
            await streamProcessor.processStream(reader);
        } catch (error) {
            this.stateManager.emit({
                type: 'chat:error',
                error: error as Error
            });
            throw error;
        }
    }

    async generateStream(prompt: string, options: StreamingOptions): Promise<void> {
        return this.chatStream([{ role: 'user', content: prompt }], options);
    }

    async pushModel(modelId: string, modelPath: string, onProgress?: ProgressCallback): Promise<void> {
        // Ollama doesn't support streaming uploads yet
        throw new Error('Streaming uploads not supported by Ollama');
    }

    async copyModel(sourceId: string, targetId: string, onProgress?: ProgressCallback): Promise<void> {
        // Ollama doesn't provide progress for copy operations
        await this.api.copyModel(sourceId, targetId);
    }
} 