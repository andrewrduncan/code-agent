import * as vscode from 'vscode';
import { OllamaService } from './OllamaService';

export class ChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'codeAgent.chatView';
    private _view?: vscode.WebviewView;
    private _messages: Array<{ role: string; content: string }> = [];
    private _mode: 'chat' | 'agent' = 'chat';

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _ollamaService: OllamaService
    ) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        // Get resource URIs
        const scriptUri = webviewView.webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'dist', 'chat.js')
        );
        const styleMainUri = webviewView.webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'main.css')
        );
        const styleChatUri = webviewView.webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'dist', 'chat.css')
        );

        const nonce = this._getNonce();

        webviewView.webview.html = `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webviewView.webview.cspSource}; script-src 'nonce-${nonce}' ${webviewView.webview.cspSource}; img-src ${webviewView.webview.cspSource} https: data:;">
            <link href="${styleMainUri}" rel="stylesheet">
            <link href="${styleChatUri}" rel="stylesheet">
            <title>Code Agent Chat</title>
        </head>
        <body>
            <div id="root"></div>
            <script nonce="${nonce}" src="${scriptUri}"></script>
        </body>
        </html>`;

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'sendMessage':
                    await this._sendMessage(data.message);
                    break;
                case 'openSettings':
                    await vscode.commands.executeCommand('codeAgent.openSettings');
                    break;
                case 'getModels':
                    await this._sendAvailableModels();
                    break;
                case 'setMode':
                    this._mode = data.mode;
                    break;
                case 'setModel':
                    await vscode.workspace.getConfiguration('codeAgent').update('model', data.model, true);
                    await this._ollamaService.initialize();
                    break;
            }
        });

        // Send initial models
        this._sendAvailableModels();
    }

    private async _sendAvailableModels() {
        if (!this._view) return;

        try {
            const models = await this._ollamaService.getAvailableModels();
            const currentModel = vscode.workspace.getConfiguration('codeAgent').get('model');
            this._view.webview.postMessage({ 
                type: 'updateModels', 
                models,
                currentModel
            });
        } catch (error) {
            console.error('Error fetching models:', error);
            this._view.webview.postMessage({ 
                type: 'addMessage', 
                message: { 
                    role: 'error', 
                    content: 'Failed to fetch available models. Please check your Ollama connection.' 
                } 
            });
        }
    }

    private async _sendMessage(message: string) {
        if (!this._view) return;

        // Add user message
        this._messages.push({ role: 'user', content: message });
        this._view.webview.postMessage({ type: 'addMessage', message: { role: 'user', content: message } });

        try {
            // Show loading state
            this._view.webview.postMessage({ type: 'setLoading', loading: true });

            // Get AI response
            const response = await this._ollamaService.chat(this._messages);
            
            // Add AI response
            this._messages.push({ role: 'assistant', content: response });
            this._view.webview.postMessage({ 
                type: 'addMessage', 
                message: { 
                    role: 'assistant', 
                    content: response
                } 
            });
        } catch (error) {
            console.error('Chat error:', error);
            this._view.webview.postMessage({ 
                type: 'addMessage', 
                message: { 
                    role: 'error', 
                    content: error instanceof Error ? error.message : 'Error: Failed to get response from AI. Please check your settings and try again.' 
                } 
            });
            // Remove the failed message from history
            this._messages.pop();
        } finally {
            // Hide loading state
            this._view.webview.postMessage({ type: 'setLoading', loading: false });
        }
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