import * as vscode from 'vscode';
import { BaseLLMProvider, SelfHostedLLMProvider, ModelInfo, LLMOptions } from './types/llm-interfaces';

interface WebviewMessage {
    type: 'getState' | 'setProvider' | 'setModel' | 'updateSettings' | 'updateModelConfig' |
          'deleteModel' | 'copyModel' | 'pullModel' | 'uploadModel';
    provider?: string;
    model?: string;
    settings?: Record<string, any>;
    config?: LLMOptions;
    source?: string;
    target?: string;
    name?: string;
    file?: string;
}

export class SettingsViewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private readonly _supportedProviders = ['Ollama', 'OpenAI', 'Anthropic'];
    private _llmProvider: BaseLLMProvider;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        llmProvider: BaseLLMProvider
    ) {
        this._llmProvider = llmProvider;
    }

    public updateProvider(provider: BaseLLMProvider) {
        this._llmProvider = provider;
        this._sendState();
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        this._setWebviewMessageListener(webviewView.webview);
    }

    private async _setWebviewMessageListener(webview: vscode.Webview) {
        webview.onDidReceiveMessage(async (data: unknown) => {
            const message = data as WebviewMessage;
            try {
                switch (message.type) {
                    case 'getState':
                        await this._sendState();
                        break;
                    case 'setProvider':
                        if (message.provider) {
                            await this._updateProvider(message.provider);
                        }
                        break;
                    case 'setModel':
                        if (message.model) {
                            await this._updateModel(message.model);
                        }
                        break;
                    case 'updateSettings':
                        if (message.settings) {
                            await this._updateSettings(message.settings);
                        }
                        break;
                    case 'updateModelConfig':
                        if (message.config) {
                            await this._updateModelConfig(message.config);
                        }
                        break;
                    case 'deleteModel':
                        if (message.model && this.isSelfHostedProvider(this._llmProvider)) {
                            await this._llmProvider.deleteModel(message.model);
                            await this._sendState();
                            this._postMessage({ type: 'showSuccess', message: `Model ${message.model} deleted successfully` });
                        }
                        break;
                    case 'copyModel':
                        if (message.source && message.target && this.isSelfHostedProvider(this._llmProvider)) {
                            await this._llmProvider.copyModel(message.source, message.target);
                            await this._sendState();
                            this._postMessage({ type: 'showSuccess', message: `Model ${message.source} copied to ${message.target}` });
                        }
                        break;
                    case 'pullModel':
                        if (message.model && this.isSelfHostedProvider(this._llmProvider)) {
                            try {
                                await this._pullModelWithProgress(message.model);
                                await this._sendState();
                                this._postMessage({ type: 'showSuccess', message: `Model ${message.model} pulled successfully` });
                            } catch (error) {
                                throw new Error(`Failed to pull model: ${error instanceof Error ? error.message : 'Unknown error'}`);
                            }
                        }
                        break;
                    case 'uploadModel':
                        if (message.name && message.file && this.isSelfHostedProvider(this._llmProvider)) {
                            try {
                                // Get the workspace folder
                                const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                                if (!workspaceFolder) {
                                    throw new Error('No workspace folder found');
                                }

                                // Create models directory if it doesn't exist
                                const modelsDir = vscode.Uri.joinPath(workspaceFolder.uri, 'models');
                                try {
                                    await vscode.workspace.fs.createDirectory(modelsDir);
                                } catch (e) {
                                    // Directory might already exist
                                }

                                // Write the file
                                const modelPath = vscode.Uri.joinPath(modelsDir, message.name);
                                const fileContent = Buffer.from(message.file, 'base64');
                                await vscode.workspace.fs.writeFile(modelPath, fileContent);

                                // Push the model to the provider
                                await this._llmProvider.pushModel(message.name, modelPath.fsPath);
                                await this._sendState();
                                this._postMessage({ type: 'showSuccess', message: `Model ${message.name} uploaded successfully` });
                            } catch (error) {
                                throw new Error(`Failed to upload model: ${error instanceof Error ? error.message : 'Unknown error'}`);
                            }
                        }
                        break;
                }
            } catch (error) {
                console.error('Error in settings view:', error);
                this._postMessage({ 
                    type: 'showError', 
                    error: error instanceof Error ? error.message : 'An error occurred' 
                });
            }
        });
    }

    private async _sendState() {
        const config = vscode.workspace.getConfiguration('codeAgent');
        const currentProvider = config.get('provider') as string || 'Ollama';
        const currentModel = config.get('model') as string;
        const modelConfig = config.get('modelConfig') as LLMOptions || {
            temperature: 0.7,
            max_tokens: 2048,
            top_p: 0.9,
            frequency_penalty: 0,
            presence_penalty: 0
        };
        
        let models: string[] = [];
        if (this.isSelfHostedProvider(this._llmProvider)) {
            const modelInfos = await this._llmProvider.listModels();
            models = modelInfos.map(m => m.name);
        } else {
            models = this._llmProvider.supportedModels;
        }

        const settings = {
            ollamaHost: config.get('ollamaHost'),
            ollamaPort: config.get('ollamaPort'),
            apiKey: config.get('apiKey'),
            orgId: config.get('orgId')
        };

        this._postMessage({
            type: 'updateState',
            providers: this._supportedProviders,
            currentProvider,
            models,
            currentModel,
            settings,
            modelConfig,
            isSelfHosted: this.isSelfHostedProvider(this._llmProvider)
        });
    }

    private async _updateProvider(provider: string) {
        await vscode.workspace.getConfiguration('codeAgent').update('provider', provider, true);
        // Note: Provider switching logic would need to be implemented in extension.ts
        await this._sendState();
    }

    private async _updateModel(model: string) {
        await vscode.workspace.getConfiguration('codeAgent').update('model', model, true);
        this._postMessage({ type: 'showSuccess', message: `Model updated to ${model}` });
    }

    private async _updateSettings(settings: Record<string, any>) {
        const config = vscode.workspace.getConfiguration('codeAgent');
        for (const [key, value] of Object.entries(settings)) {
            await config.update(key, value, true);
        }
        this._postMessage({ type: 'showSuccess', message: 'Settings updated successfully' });
    }

    private async _updateModelConfig(config: LLMOptions) {
        await vscode.workspace.getConfiguration('codeAgent').update('modelConfig', config, true);
        this._postMessage({ type: 'showSuccess', message: 'Model configuration updated successfully' });
    }

    private async _pullModelWithProgress(model: string) {
        if (!this.isSelfHostedProvider(this._llmProvider)) {
            throw new Error('Current provider does not support pulling models');
        }

        // Initialize progress tracking
        let progress = 0;
        let totalSize = 0;
        let downloadedSize = 0;

        const updateProgress = (status: string, current: number, total?: number) => {
            if (total && total > 0) {
                progress = Math.min(100, Math.round((current / total) * 100));
            }

            this._postMessage({
                type: 'updateProgress',
                progress,
                message: `${status} - ${progress}%`
            });
        };

        try {
            // Start the pull operation with progress tracking
            const response = await fetch(`${this._llmProvider.baseUrl}/api/pull`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: model })
            });

            if (!response.ok) {
                throw new Error(`Failed to pull model: ${response.status} ${response.statusText}`);
            }

            const reader = response.body?.getReader();
            if (!reader) {
                throw new Error('No response body available');
            }

            // Read the stream
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                // Parse the chunks
                const text = new TextDecoder().decode(value);
                const lines = text.split('\n').filter(line => line.trim());

                for (const line of lines) {
                    try {
                        const data = JSON.parse(line);
                        
                        if (data.total) {
                            totalSize = parseInt(data.total);
                        }
                        if (data.completed) {
                            downloadedSize = parseInt(data.completed);
                        }

                        // Update status message based on the operation phase
                        let status = 'Downloading model';
                        if (data.status) {
                            status = data.status;
                        }

                        // Special handling for different phases
                        if (data.status === 'processing') {
                            updateProgress('Processing model files', 90);
                        } else if (data.status === 'verifying') {
                            updateProgress('Verifying download', 95);
                        } else if (data.status === 'done') {
                            updateProgress('Finalizing', 100);
                        } else if (totalSize > 0) {
                            updateProgress(status, downloadedSize, totalSize);
                        }
                    } catch (e) {
                        // Ignore parse errors for non-JSON lines
                        console.debug('Non-JSON line:', line);
                    }
                }
            }
        } catch (error) {
            throw error;
        }
    }

    private isSelfHostedProvider(provider: BaseLLMProvider): provider is SelfHostedLLMProvider {
        return 'listModels' in provider;
    }

    private _postMessage(message: any) {
        if (this._view) {
            this._view.webview.postMessage(message);
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'settings.js')
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'style.css')
        );

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${styleUri}" rel="stylesheet">
                <title>Code Agent Settings</title>
            </head>
            <body>
                <div class="settings-container">
                    <div class="setting-group">
                        <h3>Provider Selection</h3>
                        <select id="provider-select">
                            <option value="Ollama">Ollama</option>
                            <option value="OpenAI">OpenAI</option>
                            <option value="Anthropic">Anthropic</option>
                        </select>
                    </div>

                    <form id="provider-settings" class="setting-group">
                        <!-- Provider settings will be dynamically inserted here -->
                    </form>

                    <div class="setting-group">
                        <h3>Model Selection</h3>
                        <select id="model-select">
                            <option value="">Loading models...</option>
                        </select>
                    </div>

                    <form id="model-config" class="setting-group">
                        <h3>Model Configuration</h3>
                        <div class="form-group">
                            <label for="temperature">Temperature:</label>
                            <div class="range-with-value">
                                <input type="range" id="temperature" name="temperature" min="0" max="1" step="0.1" value="0.7">
                                <span class="range-value">0.7</span>
                            </div>
                        </div>
                        <div class="form-group">
                            <label for="maxTokens">Max Tokens:</label>
                            <input type="number" id="maxTokens" name="maxTokens" min="1" max="200000" value="2048">
                        </div>
                        <div class="form-group">
                            <label for="topP">Top P:</label>
                            <div class="range-with-value">
                                <input type="range" id="topP" name="topP" min="0" max="1" step="0.1" value="0.9">
                                <span class="range-value">0.9</span>
                            </div>
                        </div>
                        <div class="form-group">
                            <label for="frequencyPenalty">Frequency Penalty:</label>
                            <div class="range-with-value">
                                <input type="range" id="frequencyPenalty" name="frequencyPenalty" min="0" max="2" step="0.1" value="0">
                                <span class="range-value">0</span>
                            </div>
                        </div>
                        <div class="form-group">
                            <label for="presencePenalty">Presence Penalty:</label>
                            <div class="range-with-value">
                                <input type="range" id="presencePenalty" name="presencePenalty" min="0" max="2" step="0.1" value="0">
                                <span class="range-value">0</span>
                            </div>
                        </div>
                        <button type="submit">Save Configuration</button>
                    </form>

                    <div id="model-actions" class="setting-group self-hosted-only">
                        <h3>Model Actions</h3>
                        <div class="button-group">
                            <button type="button" data-action="pull">Pull Model</button>
                            <button type="button" data-action="copy">Copy Model</button>
                            <button type="button" data-action="delete">Delete Model</button>
                        </div>
                        <div id="progress-container" class="hidden">
                            <div class="progress-bar">
                                <div class="progress-fill"></div>
                            </div>
                            <div class="progress-text">Processing...</div>
                        </div>
                    </div>

                    <form id="model-upload" class="setting-group self-hosted-only">
                        <h3>Upload New Model</h3>
                        <div class="form-group">
                            <label for="modelName">Model Name:</label>
                            <input type="text" id="modelName" name="modelName" required>
                        </div>
                        <div class="form-group">
                            <label for="modelFile">Model File:</label>
                            <input type="file" id="modelFile" name="modelFile" required>
                        </div>
                        <div class="upload-progress hidden">
                            <div class="progress-bar">
                                <div class="progress-fill"></div>
                            </div>
                            <div class="progress-text">Uploading...</div>
                        </div>
                        <button type="submit">Upload Model</button>
                    </form>
                </div>
                <script src="${scriptUri}"></script>
            </body>
            </html>`;
    }
} 