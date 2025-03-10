import * as vscode from 'vscode';
import { BaseLLMProvider, LLMMessage, ModelInfo, SelfHostedLLMProvider } from './types/llm-interfaces';

interface SavedChat {
    id: string;
    name: string;
    messages: LLMMessage[];
    createdAt: string;
    lastModified: string;
}

interface WebviewMessage {
    type: 'sendMessage' | 'clearChat' | 'getModels' | 'addMessage' | 'setLoading' | 'updateModels' | 
          'loadHistory' | 'loadChat' | 'deleteChat' | 'renameChat' | 'updateThinking' | 'openSettings' |
          'loadChatHistory';
    text?: string;
    message?: LLMMessage;
    loading?: boolean;
    models?: string[];
    messages?: LLMMessage[];
    chatId?: string;
    chatName?: string;
    content?: string;
    chats?: SavedChat[];
    payload?: {
        content: string;
        done: boolean;
    };
}

export class ChatViewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private _messages: LLMMessage[] = [];
    private _isLoading = false;
    private _llmProvider: BaseLLMProvider;
    private _currentChatId?: string;
    private readonly _storageKey = 'savedChats';

    constructor(
        private readonly _extensionUri: vscode.Uri,
        llmProvider: BaseLLMProvider,
        private readonly _storage: vscode.Memento
    ) {
        this._llmProvider = llmProvider;
    }

    public updateProvider(provider: BaseLLMProvider) {
        this._llmProvider = provider;
        // Clear messages when switching providers
        this._messages = [];
        if (this._view) {
            this._postMessage({ type: 'clearChat' });
        }
    }

    public newChat() {
        if (this._view) {
            this._messages = [];
            this._currentChatId = undefined;
            this._postMessage({ type: 'clearChat' });
        }
    }

    private async _loadSavedChats() {
        const savedChats = this._storage.get<SavedChat[]>(this._storageKey, []);
        
        // Sort chats by lastModified in descending order (newest first)
        savedChats.sort((a, b) => b.lastModified.localeCompare(a.lastModified));
        
        if (this._view) {
            // First clear any existing state
            this._messages = [];
            this._currentChatId = undefined;
            this._postMessage({ type: 'clearChat' });
            
            // Send all chats in a single batch
            this._postMessage({
                type: 'loadChatHistory',
                chats: savedChats.map(chat => ({
                    id: chat.id,
                    name: chat.name,
                    messages: chat.messages,
                    createdAt: chat.createdAt,
                    lastModified: chat.lastModified
                }))
            });

            // Set the current chat to the most recent one
            if (savedChats.length > 0) {
                const mostRecentChat = savedChats[0];
                this._currentChatId = mostRecentChat.id;
                this._messages = [...mostRecentChat.messages];
            }
        }
    }

    private async _saveChatHistory() {
        if (this._currentChatId) {
            const savedChats = this._storage.get<SavedChat[]>(this._storageKey, []);
            const chatIndex = savedChats.findIndex(chat => chat.id === this._currentChatId);
            
            const now = new Date().toISOString();
            if (chatIndex !== -1) {
                // Update existing chat
                savedChats[chatIndex] = {
                    ...savedChats[chatIndex],
                    messages: this._messages,
                    lastModified: now
                };
            } else {
                // Create new chat
                const chatName = await this._generateChatName(this._messages[0]?.content || 'New Chat');
                savedChats.push({
                    id: this._currentChatId,
                    name: chatName,
                    messages: this._messages,
                    createdAt: now,
                    lastModified: now
                });
            }
            
            // Sort chats by lastModified in descending order (newest first)
            savedChats.sort((a, b) => b.lastModified.localeCompare(a.lastModified));
            
            // Save the updated chats
            await this._storage.update(this._storageKey, savedChats);
        }
    }

    private async _generateChatName(firstMessage: string): Promise<string> {
        // Generate a short name based on the first message
        // Limit to first 50 characters and add ellipsis if longer
        const maxLength = 50;
        return firstMessage.length > maxLength 
            ? `${firstMessage.substring(0, maxLength)}...`
            : firstMessage;
    }

    private async _deleteChat(chatId: string) {
        const savedChats = this._storage.get<SavedChat[]>(this._storageKey, []);
        const updatedChats = savedChats.filter(chat => chat.id !== chatId);
        await this._storage.update(this._storageKey, updatedChats);
        
        if (chatId === this._currentChatId) {
            // If we deleted the current chat, clear the messages
            this._messages = [];
            this._currentChatId = undefined;
            this._postMessage({ type: 'clearChat' });
        }
        
        // Reload chat history after deletion
        this._loadSavedChats();
    }

    private async _renameChat(chatId: string, newName: string) {
        const savedChats = this._storage.get<SavedChat[]>(this._storageKey, []);
        const chatIndex = savedChats.findIndex(chat => chat.id === chatId);
        if (chatIndex !== -1) {
            savedChats[chatIndex].name = newName;
            await this._storage.update(this._storageKey, savedChats);
        }
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
        
        // Load saved chats when view is created
        this._loadSavedChats();

        // Add visibility change handler
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                this._loadSavedChats();
            }
        });
    }

    private async _setWebviewMessageListener(webview: vscode.Webview) {
        webview.onDidReceiveMessage(async (data: unknown) => {
            const message = data as WebviewMessage;
            switch (message.type) {
                case 'sendMessage':
                    if (message.text) {
                        await this._handleUserMessage(message.text);
                    }
                    break;
                case 'clearChat':
                    this._messages = [];
                    this._currentChatId = undefined;
                    await this._saveChatHistory();
                    this._postMessage({ type: 'clearChat' });
                    break;
                case 'openSettings':
                    vscode.commands.executeCommand('workbench.view.extension.code-agent-settings');
                    break;
                case 'getModels':
                    if (this.isSelfHostedProvider(this._llmProvider)) {
                        const models = await this._llmProvider.listModels();
                        this._postMessage({
                            type: 'updateModels',
                            models: models.map((m: ModelInfo) => m.name)
                        });
                    }
                    break;
                case 'loadChat':
                    if (message.chatId) {
                        const savedChats = this._storage.get<SavedChat[]>(this._storageKey, []);
                        const chat = savedChats.find(c => c.id === message.chatId);
                        if (chat) {
                            // Clear current state and set new state
                            this._currentChatId = chat.id;
                            this._messages = [...chat.messages]; // Create a new array to avoid reference issues
                            
                            // Send both chat metadata and messages in one message
                            this._postMessage({ 
                                type: 'loadChat',
                                chatId: chat.id,
                                chatName: chat.name,
                                messages: chat.messages
                            });
                        }
                    }
                    break;
                case 'deleteChat':
                    if (message.chatId) {
                        await this._deleteChat(message.chatId);
                    }
                    break;
                case 'renameChat':
                    if (message.chatId && message.chatName) {
                        await this._renameChat(message.chatId, message.chatName);
                    }
                    break;
                case 'updateThinking':
                    if (message.content) {
                        this._postMessage({ 
                            type: 'updateThinking', 
                            payload: {
                                content: message.content,
                                done: false
                            }
                        });
                    }
                    break;
            }
        });
    }

    private isSelfHostedProvider(provider: BaseLLMProvider): provider is SelfHostedLLMProvider {
        return 'listModels' in provider;
    }

    private async _handleUserMessage(text: string) {
        if (this._isLoading) return;

        console.log('Handling user message:', text);
        
        if (!this._llmProvider) {
            console.error('No LLM provider available');
            this._postMessage({ 
                type: 'addMessage', 
                message: { 
                    role: 'error', 
                    content: 'No language model provider is configured. Please check your settings.' 
                } 
            });
            return;
        }

        const userMessage: LLMMessage = { role: 'user', content: text };
        
        // Add the message to our local state
        this._messages.push(userMessage);
        
        // If this is a new chat, create it immediately
        if (!this._currentChatId) {
            this._currentChatId = Date.now().toString();
            const chatName = await this._generateChatName(text);
            
            // Create and save the new chat
            const newChat: SavedChat = {
                id: this._currentChatId,
                name: chatName,
                messages: [userMessage],
                createdAt: new Date().toISOString(),
                lastModified: new Date().toISOString()
            };
            
            const savedChats = this._storage.get<SavedChat[]>(this._storageKey, []);
            savedChats.push(newChat);
            await this._storage.update(this._storageKey, savedChats);
            
            // Notify the webview of the new chat with messages
            this._postMessage({
                type: 'loadChat',
                chatId: this._currentChatId,
                chatName: chatName,
                messages: [userMessage]
            });
        }
        
        // Add the user message to the UI
        this._postMessage({ type: 'addMessage', message: userMessage });
        
        // Set loading state
        this._isLoading = true;
        this._postMessage({ type: 'setLoading', loading: true });

        try {
            console.log('Sending to LLM provider with messages:', this._messages);
            let lastThinking = '';
            const response = await this._llmProvider.chat(this._messages, {
                onThinking: (thought: string) => {
                    console.log('Thinking:', thought);
                    if (thought !== lastThinking) {
                        lastThinking = thought;
                        this._postMessage({ 
                            type: 'updateThinking', 
                            payload: {
                                content: thought,
                                done: false
                            }
                        });
                    }
                }
            });
            console.log('Received response:', response);

            // Add the response to our local state
            this._messages.push(response);
            
            // Update the UI
            this._postMessage({ type: 'addMessage', message: response });
            
            // Save the updated chat history
            await this._saveChatHistory();
        } catch (error) {
            console.error('Error in chat:', error);
            const errorMessage: LLMMessage = {
                role: 'error',
                content: error instanceof Error ? error.message : 'An error occurred'
            };
            this._postMessage({ type: 'addMessage', message: errorMessage });
        } finally {
            this._isLoading = false;
            this._postMessage({ type: 'setLoading', loading: false });
        }
    }

    private _postMessage(message: WebviewMessage) {
        if (this._view) {
            this._view.webview.postMessage(message);
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js')
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'style.css')
        );
        const codiconUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@vscode/codicons', 'dist', 'codicon.css')
        );

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${codiconUri}" rel="stylesheet">
                <link href="${styleUri}" rel="stylesheet">
                <title>Code Agent Chat</title>
            </head>
            <body>
                <div class="app-container">
                    <div class="content-container">
                        <!-- New Chat View -->
                        <div id="new-chat-view" class="new-chat-view">
                            <div class="input-wrapper">
                                <textarea id="new-chat-input" 
                                    class="new-chat-input" 
                                    placeholder="Type your question to start a new chat..."></textarea>
                            </div>
                            <div class="chat-history">
                                <h3>Chat History</h3>
                                <div id="chat-list"></div>
                            </div>
                        </div>

                        <!-- Active Chat View -->
                        <div id="active-chat-view" class="active-chat-view hidden">
                            <div id="messages" class="messages"></div>
                            <div id="input-container" class="input-container">
                                <textarea id="user-input" placeholder="Type your message..."></textarea>
                                <button id="send-button">Send</button>
                            </div>
                        </div>
                    </div>
                </div>
                <script src="${scriptUri}"></script>
            </body>
            </html>`;
    }
}