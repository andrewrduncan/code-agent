import * as vscode from 'vscode';

interface OllamaModel {
    name: string;
    size: number;
    digest: string;
    modified_at: string;
}

interface OllamaModelList {
    models: OllamaModel[];
}

export class ModelManager {
    private static DEFAULT_MODEL = 'codellama:latest';
    private static FALLBACK_MODEL = 'mistral:latest';

    constructor(private host: string, private port: number) {}

    async getAvailableModels(): Promise<string[]> {
        try {
            const url = `http://${this.host}:${this.port}/api/tags`;
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`);
            }

            const data = await response.json() as OllamaModelList;
            return data.models.map(model => model.name);
        } catch (error) {
            console.error('Error fetching models:', error);
            throw error;
        }
    }

    async checkModelAvailability(modelName: string): Promise<boolean> {
        try {
            const models = await this.getAvailableModels();
            return models.includes(modelName);
        } catch {
            return false;
        }
    }

    async pullModel(modelName: string, onProgress?: (progress: string) => void): Promise<void> {
        const url = `http://${this.host}:${this.port}/api/pull`;
        
        try {
            onProgress?.(`Starting download of ${modelName}...`);
            
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name: modelName }),
            });

            if (!response.ok) {
                throw new Error(`Failed to pull model: ${response.status} ${response.statusText}`);
            }

            // Read the stream of progress updates
            const reader = response.body?.getReader();
            if (!reader) {
                throw new Error('No response body');
            }

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                // Convert the progress update to text
                const text = new TextDecoder().decode(value);
                onProgress?.(text);
            }

            onProgress?.(`Successfully downloaded ${modelName}`);
        } catch (error) {
            console.error('Error pulling model:', error);
            throw error;
        }
    }

    async ensureModelAvailable(preferredModel: string = ModelManager.DEFAULT_MODEL): Promise<string> {
        try {
            // First check if preferred model is available
            const isPreferredAvailable = await this.checkModelAvailability(preferredModel);
            if (isPreferredAvailable) {
                return preferredModel;
            }

            // If not, check for any available models
            const availableModels = await this.getAvailableModels();
            if (availableModels.length > 0) {
                return availableModels[0];
            }

            // If no models available, pull the fallback model
            await this.pullModel(ModelManager.FALLBACK_MODEL, 
                (progress) => vscode.window.showInformationMessage(`Downloading model: ${progress}`)
            );
            return ModelManager.FALLBACK_MODEL;

        } catch (error) {
            console.error('Error ensuring model availability:', error);
            throw error;
        }
    }

    static async initialize(host: string, port: number): Promise<ModelManager> {
        const manager = new ModelManager(host, port);
        try {
            // Test connection
            await manager.getAvailableModels();
            return manager;
        } catch (error) {
            throw new Error(`Failed to connect to Ollama at http://${host}:${port}. Please check if Ollama is running.`);
        }
    }
} 