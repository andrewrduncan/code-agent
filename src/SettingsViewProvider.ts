import * as vscode from 'vscode';
import { OllamaService } from './OllamaService';

interface WebviewContainer {
    webview: vscode.Webview;
}

export class SettingsViewProvider {
    private ollamaService: OllamaService;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        ollamaService: OllamaService
    ) {
        this.ollamaService = ollamaService;
    }

    public resolveWebviewView(
        webview: vscode.WebviewView | WebviewContainer,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        const webviewToUse = webview.webview;
        
        webviewToUse.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        const nonce = this._getNonce();
        
        this.updateWebview(webviewToUse, nonce);
    }

    private async updateWebview(webview: vscode.Webview, nonce: string) {
        try {
            const models = await this.ollamaService.getAvailableModels();
            webview.html = this._getHtmlForWebview(models, nonce);
            this._setupMessageListener(webview);
        } catch (error) {
            webview.html = this._getErrorHtml(error instanceof Error ? error.message : 'Failed to load models');
        }
    }

    private _setupMessageListener(webview: vscode.Webview) {
        webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'saveSettings':
                    try {
                        await vscode.workspace.getConfiguration('codeAgent').update('ollamaHost', data.ollamaHost, true);
                        await vscode.workspace.getConfiguration('codeAgent').update('ollamaPort', parseInt(data.ollamaPort), true);
                        await vscode.workspace.getConfiguration('codeAgent').update('model', data.model, true);
                        vscode.window.showInformationMessage('Settings saved successfully!');
                        
                        // Reinitialize the Ollama service with new settings
                        await this.ollamaService.initialize();
                        
                        // Update the webview with new model list
                        await this.updateWebview(webview, this._getNonce());
                    } catch (error) {
                        vscode.window.showErrorMessage('Failed to save settings: ' + (error instanceof Error ? error.message : 'Unknown error'));
                    }
                    break;
            }
        });
    }

    private _getErrorHtml(error: string) {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Error</title>
            <style>
                body {
                    padding: 20px;
                    color: var(--vscode-foreground);
                    font-family: var(--vscode-font-family);
                }
                .error {
                    color: var(--vscode-errorForeground);
                    margin-bottom: 15px;
                }
            </style>
        </head>
        <body>
            <h2>Error Loading Settings</h2>
            <div class="error">${error}</div>
            <p>Please check your Ollama connection settings and try again.</p>
        </body>
        </html>`;
    }

    private _getHtmlForWebview(availableModels: string[], nonce: string) {
        const config = vscode.workspace.getConfiguration('codeAgent');
        const currentHost = config.get('ollamaHost');
        const currentPort = config.get('ollamaPort');
        const currentModel = config.get('model');

        const modelOptions = availableModels
            .map(model => `<option value="${model}" ${model === currentModel ? 'selected' : ''}>${model}</option>`)
            .join('\n');

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
            <title>Code Agent Settings</title>
            <style>
                body {
                    padding: 20px;
                    color: var(--vscode-foreground);
                    font-family: var(--vscode-font-family);
                }
                .form-group {
                    margin-bottom: 15px;
                }
                label {
                    display: block;
                    margin-bottom: 5px;
                }
                input, select {
                    width: 100%;
                    padding: 5px;
                    background: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                }
                button {
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 8px 12px;
                    cursor: pointer;
                }
                button:hover {
                    background: var(--vscode-button-hoverBackground);
                }
                .model-info {
                    margin-top: 5px;
                    font-size: 0.9em;
                    color: var(--vscode-descriptionForeground);
                }
            </style>
        </head>
        <body>
            <form id="settingsForm">
                <div class="form-group">
                    <label for="ollamaHost">Ollama Host:</label>
                    <input type="text" id="ollamaHost" value="${currentHost}" required>
                </div>
                <div class="form-group">
                    <label for="ollamaPort">Ollama Port:</label>
                    <input type="number" id="ollamaPort" value="${currentPort}" required>
                </div>
                <div class="form-group">
                    <label for="model">Model:</label>
                    <select id="model" required>
                        ${modelOptions}
                    </select>
                    <div class="model-info">
                        ${availableModels.length} models available
                    </div>
                </div>
                <button type="submit">Save Settings</button>
            </form>
            <script nonce="${nonce}">
                const vscode = acquireVsCodeApi();
                document.getElementById('settingsForm').addEventListener('submit', (e) => {
                    e.preventDefault();
                    vscode.postMessage({
                        type: 'saveSettings',
                        ollamaHost: document.getElementById('ollamaHost').value,
                        ollamaPort: document.getElementById('ollamaPort').value,
                        model: document.getElementById('model').value
                    });
                });
            </script>
        </body>
        </html>`;
    }

    private _getNonce() {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }
} 