import * as vscode from 'vscode';
import { ChatViewProvider } from './ChatViewProvider';
import { SettingsViewProvider } from './SettingsViewProvider';
import { OllamaProvider } from './providers/OllamaProvider';
import { BaseLLMProvider, SelfHostedLLMProvider } from './types/llm-interfaces';
import { OpenAIProvider } from './providers/OpenAIProvider';
import { AnthropicProvider } from './providers/AnthropicProvider';
import { ErrorHandlingProvider } from './providers/ErrorHandlingProvider';

let currentProvider: BaseLLMProvider;
let chatProvider: ChatViewProvider;
let settingsProvider: SettingsViewProvider;

async function initializeProvider(): Promise<BaseLLMProvider> {
    const config = vscode.workspace.getConfiguration('codeAgent');
    const providerType = config.get('provider') as string || 'Ollama';

    try {
        let provider: BaseLLMProvider;
        
        switch (providerType) {
            case 'Ollama':
                const host = config.get('ollamaHost') as string || 'localhost';
                const portStr = config.get('ollamaPort');
                const port = typeof portStr === 'string' ? parseInt(portStr, 10) : (portStr as number) || 11434;
                
                console.log('Initializing Ollama provider with:', { host, port });
                provider = new OllamaProvider(host, port);
                
                try {
                    // Check if provider is self-hosted before calling listModels
                    if ('listModels' in provider) {
                        await (provider as SelfHostedLLMProvider).listModels();
                        console.log('Successfully connected to Ollama');
                    }
                } catch (error) {
                    console.error('Failed to connect to Ollama:', error);
                    throw error;
                }
                break;

            case 'OpenAI':
                const apiKey = config.get('apiKey') as string;
                if (!apiKey) {
                    throw new Error('OpenAI API key not configured');
                }
                provider = new OpenAIProvider(apiKey, config.get('orgId') as string);
                break;

            case 'Anthropic':
                const anthropicKey = config.get('anthropicKey') as string;
                if (!anthropicKey) {
                    throw new Error('Anthropic API key not configured');
                }
                provider = new AnthropicProvider(anthropicKey);
                break;

            default:
                throw new Error(`Unsupported provider type: ${providerType}`);
        }

        // Wrap the provider with error handling
        return new ErrorHandlingProvider(provider);
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to initialize ${providerType} provider: ${error instanceof Error ? error.message : 'Unknown error'}`);
        throw error;
    }
}

export async function activate(context: vscode.ExtensionContext) {
    try {
        // Initialize with default provider
        currentProvider = await initializeProvider();
        
        // Register views
        chatProvider = new ChatViewProvider(context.extensionUri, currentProvider, context.globalState);
        settingsProvider = new SettingsViewProvider(context.extensionUri, currentProvider);

        // Register webview providers
        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider('codeAgent.chatView', chatProvider),
            vscode.window.registerWebviewViewProvider('codeAgent.settingsView', settingsProvider)
        );

        // Register commands
        context.subscriptions.push(
            vscode.commands.registerCommand('codeAgent.openSettings', () => {
                vscode.commands.executeCommand('workbench.view.extension.code-agent-settings');
            }),
            vscode.commands.registerCommand('codeAgent.newChat', () => {
                if (chatProvider) {
                    chatProvider.newChat();
                }
            })
        );

        // Watch for configuration changes
        context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration(async (e) => {
                if (e.affectsConfiguration('codeAgent')) {
                    try {
                        currentProvider = await initializeProvider();
                        if (chatProvider && settingsProvider) {
                            chatProvider.updateProvider(currentProvider);
                            settingsProvider.updateProvider(currentProvider);
                        }
                    } catch (error) {
                        vscode.window.showErrorMessage(`Failed to initialize provider: ${error instanceof Error ? error.message : 'Unknown error'}`);
                    }
                }
            })
        );

    } catch (error) {
        vscode.window.showErrorMessage(`Failed to activate extension: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

export function deactivate() {} 