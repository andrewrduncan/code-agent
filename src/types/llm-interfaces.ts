// Base interfaces for common LLM functionality
export interface LLMMessage {
    role: 'user' | 'assistant' | 'system' | 'error';
    content: string;
}

export interface LLMOptions {
    model?: string;
    temperature?: number;
    max_tokens?: number;
    top_p?: number;
    frequency_penalty?: number;
    presence_penalty?: number;
    stop?: string[];
    onThinking?: (thought: string) => void;
    onLoadingStateChange?: (state: LoadingState) => void;
    stream?: boolean;
    maxTokens?: number;
}

export interface LoadingState {
    type: 'model_load' | 'model_init' | 'thinking';
    message: string;
    progress?: number;
}

export interface StreamingResponse {
    content: string;
    isDone: boolean;
    error?: string;
    thinking?: string;
}

export type StreamingCallback = (response: StreamingResponse) => void;

export interface StreamingOptions extends LLMOptions {
    onToken: StreamingCallback;
    abortSignal?: AbortSignal;
}

// Base interface for all LLM providers
export interface BaseLLMProvider {
    name: string;
    baseUrl: string;
    supportedModels: string[];
    maxContextWindow: number;
    supportsStreaming: boolean;
    
    // Standard methods
    chat(messages: LLMMessage[], options?: LLMOptions): Promise<LLMMessage>;
    generate(prompt: string, options?: LLMOptions): Promise<string>;
    embeddings(text: string | string[]): Promise<number[][]>;
    
    // Streaming methods
    chatStream(messages: LLMMessage[], options: StreamingOptions): Promise<void>;
    generateStream(prompt: string, options: StreamingOptions): Promise<void>;
}

// Interface for cloud-based (read-only) LLM providers
export interface CloudLLMProvider extends BaseLLMProvider {
    apiKey: string;
    organization?: string;
    validateApiKey(): Promise<boolean>;
    getRemainingQuota(): Promise<{
        requests: number;
        tokens: number;
        expiresAt: Date;
    }>;
}

// Progress tracking interfaces
export interface ProgressInfo {
    status: string;
    progress: number;
    total?: number;
    current?: number;
    details?: {
        speed?: number;       // bytes per second
        timeRemaining?: number; // seconds
        phase?: string;       // e.g., 'downloading', 'processing', 'verifying'
        [key: string]: any;   // allow for provider-specific details
    };
}

export type ProgressCallback = (progress: ProgressInfo) => void;

// Interface for self-hosted LLM providers with CRUD operations
export interface SelfHostedLLMProvider extends BaseLLMProvider {
    // Model Management with progress tracking
    listModels(): Promise<ModelInfo[]>;
    pullModel(modelId: string, onProgress?: ProgressCallback): Promise<void>;
    pushModel(modelId: string, modelPath: string, onProgress?: ProgressCallback): Promise<void>;
    deleteModel(modelId: string): Promise<void>;
    copyModel(sourceId: string, targetId: string, onProgress?: ProgressCallback): Promise<void>;
    
    // Model Information
    getModelInfo(modelId: string): Promise<ModelInfo>;
    getModelStatus(modelId: string): Promise<ModelStatus>;
    
    // Runtime Management
    startModel(modelId: string, options?: ModelRunOptions): Promise<void>;
    stopModel(modelId: string): Promise<void>;
    restartModel(modelId: string): Promise<void>;
    
    // Configuration
    updateModelConfig(modelId: string, config: ModelConfig): Promise<void>;
    getSystemResources(): Promise<SystemResources>;

    // Progress tracking capability flag
    readonly supportsProgress: boolean;
}

// Supporting interfaces for self-hosted providers
export interface ModelInfo {
    id: string;
    name: string;
    description?: string;
    parameters: number;
    quantization?: string;
    format: 'gguf' | 'ggml' | 'safetensors' | 'pytorch' | string;
    size: number;
    license?: string;
    creator?: string;
    lastModified: Date;
}

export interface ModelStatus {
    isRunning: boolean;
    memoryUsage: number;
    loadTime?: number;
    uptime?: number;
    requestsServed?: number;
    errors?: string[];
}

export interface ModelRunOptions {
    gpuLayers?: number;
    threads?: number;
    contextWindow?: number;
    batchSize?: number;
    lowVram?: boolean;
    customArgs?: Record<string, any>;
}

export interface ModelConfig {
    defaultOptions?: LLMOptions;
    systemPrompt?: string;
    maxConcurrentRequests?: number;
    timeoutMs?: number;
    keepAlive?: boolean;
    keepAliveTimeMs?: number;
}

export interface SystemResources {
    cpuCount: number;
    cpuUsage: number;
    totalMemory: number;
    usedMemory: number;
    gpuInfo?: {
        name: string;
        totalMemory: number;
        usedMemory: number;
    }[];
} 