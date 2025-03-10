import { OllamaEvent, OllamaEventEmitter, OllamaState, ModelState, ChatState } from '../types/events';

export class OllamaStateManager implements OllamaEventEmitter {
    private handlers: Map<string, Set<(event: OllamaEvent) => void>> = new Map();
    private state: OllamaState = {
        models: {
            availableModels: [],
            isLoading: false,
            error: undefined
        },
        chat: {
            isThinking: false,
            error: undefined
        }
    };

    // Event handling
    emit(event: OllamaEvent): void {
        const handlers = this.handlers.get(event.type);
        if (handlers) {
            handlers.forEach(handler => handler(event));
        }
        this.updateState(event);
    }

    on(type: string, handler: (event: OllamaEvent) => void): void {
        if (!this.handlers.has(type)) {
            this.handlers.set(type, new Set());
        }
        this.handlers.get(type)!.add(handler);
    }

    off(type: string, handler: (event: OllamaEvent) => void): void {
        const handlers = this.handlers.get(type);
        if (handlers) {
            handlers.delete(handler);
        }
    }

    // State management
    private updateState(event: OllamaEvent): void {
        switch (event.type) {
            case 'models:loading':
                this.updateModelState({ 
                    isLoading: true,
                    error: undefined 
                });
                break;
            case 'models:loaded':
                if (Array.isArray(event.payload)) {
                    this.updateModelState({
                        isLoading: false,
                        availableModels: event.payload,
                        error: undefined
                    });
                } else {
                    console.error('Invalid payload for models:loaded event:', event.payload);
                    this.updateModelState({
                        isLoading: false,
                        error: new Error('Invalid models data received')
                    });
                }
                break;
            case 'models:error':
                this.updateModelState({
                    isLoading: false,
                    error: event.error,
                    availableModels: [] // Reset models on error
                });
                break;
            case 'model:selected':
                this.updateModelState({
                    currentModel: event.payload,
                    // Explicitly preserve other state
                    isLoading: this.state.models.isLoading,
                    availableModels: this.state.models.availableModels
                });
                break;
            case 'chat:start':
                this.updateChatState({
                    isThinking: true,
                    error: undefined
                });
                break;
            case 'chat:thinking':
                this.updateChatState({
                    isThinking: true,
                    progress: event.payload
                });
                break;
            case 'chat:complete':
                this.updateChatState({
                    isThinking: false,
                    progress: undefined
                });
                break;
            case 'chat:error':
                this.updateChatState({
                    isThinking: false,
                    error: event.error
                });
                break;
        }
    }

    private updateModelState(update: Partial<ModelState>): void {
        this.state.models = { 
            ...this.state.models, 
            ...update,
            // Ensure availableModels is always an array and preserved if not explicitly updated
            availableModels: update.availableModels !== undefined ? update.availableModels : this.state.models.availableModels || []
        };
    }

    private updateChatState(update: Partial<ChatState>): void {
        this.state.chat = { ...this.state.chat, ...update };
    }

    // State access
    getState(): OllamaState {
        return this.state;
    }
} 