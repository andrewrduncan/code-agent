import * as vscode from 'vscode';
import { ChatViewProvider } from './ChatViewProvider';
import { SettingsViewProvider } from './SettingsViewProvider';
import { OllamaService } from './OllamaService';

export async function activate(context: vscode.ExtensionContext) {
    console.log('Activating Code Agent extension...');

    // Initialize Ollama service
    const ollamaService = new OllamaService();
    try {
        await ollamaService.initialize();
    } catch (error) {
        vscode.window.showErrorMessage('Failed to connect to Ollama: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }

    // Register chat provider
    const chatProvider = new ChatViewProvider(context.extensionUri, ollamaService);
    const registration = vscode.window.registerWebviewViewProvider(
        ChatViewProvider.viewType,
        chatProvider,
        {
            webviewOptions: {
                retainContextWhenHidden: true
            }
        }
    );
    context.subscriptions.push(registration);

    // Register settings provider
    const settingsProvider = new SettingsViewProvider(context.extensionUri, ollamaService);

    // Register commands
    const toggleChatCommand = vscode.commands.registerCommand('codeAgent.toggleChat', () => {
        vscode.commands.executeCommand('workbench.view.extension.code-agent-chat');
    });
    context.subscriptions.push(toggleChatCommand);

    const openChatCommand = vscode.commands.registerCommand('codeAgent.openChat', () => {
        vscode.commands.executeCommand('workbench.view.extension.code-agent-chat');
    });
    context.subscriptions.push(openChatCommand);

    const openSettingsCommand = vscode.commands.registerCommand('codeAgent.openSettings', () => {
        try {
            const panel = vscode.window.createWebviewPanel(
                'codeAgentSettings',
                'Code Agent Settings',
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    localResourceRoots: [context.extensionUri]
                }
            );
            settingsProvider.resolveWebviewView(panel, {} as vscode.WebviewViewResolveContext, {} as vscode.CancellationToken);
        } catch (error) {
            console.error('Failed to open settings:', error);
            vscode.window.showErrorMessage('Failed to open Code Agent settings');
        }
    });
    context.subscriptions.push(openSettingsCommand);

    // Create status bar item
    const statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        100
    );
    statusBarItem.text = "$(robot) Code Agent";
    statusBarItem.command = 'codeAgent.toggleChat';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    console.log('Code Agent extension activated successfully!');
}

export function deactivate() {} 