import { ModelInfo, ProgressInfo } from './llm-interfaces';

export type OllamaEventType = 
  | 'models:loading'
  | 'models:loaded'
  | 'models:error'
  | 'model:selected'
  | 'model:loading'
  | 'model:loaded'
  | 'model:error'
  | 'chat:start'
  | 'chat:thinking'
  | 'chat:response'
  | 'chat:error'
  | 'chat:complete'
  | 'updateThinking';

export interface OllamaEvent {
  type: OllamaEventType;
  payload?: any;
  error?: Error;
}

export interface OllamaEventEmitter {
  emit(event: OllamaEvent): void;
  on(type: OllamaEventType, handler: (event: OllamaEvent) => void): void;
  off(type: OllamaEventType, handler: (event: OllamaEvent) => void): void;
}

export interface ModelState {
  availableModels: ModelInfo[];
  currentModel?: string;
  isLoading: boolean;
  error?: Error;
}

export interface ChatState {
  isThinking: boolean;
  progress?: ProgressInfo;
  error?: Error;
}

export interface OllamaState {
  models: ModelState;
  chat: ChatState;
} 