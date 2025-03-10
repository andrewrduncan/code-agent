export class OllamaError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'OllamaError';
    }
}

export class OllamaConnectionError extends OllamaError {
    constructor(baseUrl: string) {
        super(`Failed to connect to Ollama at ${baseUrl}. Please ensure Ollama is running.`);
        this.name = 'OllamaConnectionError';
    }
}

export class OllamaModelNotFoundError extends OllamaError {
    constructor(modelId: string, availableModels: string[]) {
        super(`Model '${modelId}' is not supported. Supported models are: ${availableModels.join(', ')}`);
        this.name = 'OllamaModelNotFoundError';
    }
}

export class OllamaModelLoadError extends OllamaError {
    constructor(modelId: string, reason: string) {
        super(`Failed to load model '${modelId}': ${reason}`);
        this.name = 'OllamaModelLoadError';
    }
}

export class OllamaTimeoutError extends OllamaError {
    constructor() {
        super('Model initialization timed out. The model may be too large for available memory.');
        this.name = 'OllamaTimeoutError';
    }
}

export class OllamaResponseError extends OllamaError {
    constructor(message: string) {
        super(`Invalid response from Ollama: ${message}`);
        this.name = 'OllamaResponseError';
    }
} 