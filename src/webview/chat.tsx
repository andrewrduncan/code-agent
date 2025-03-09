import { h, render } from 'preact';
import { Chat } from '../components/chat/Chat';
import '../components/chat/styles.css';

declare const acquireVsCodeApi: () => {
    postMessage: (message: any) => void;
};

// Initialize VS Code API
const vscode = acquireVsCodeApi();

// Initialize chat when the DOM is ready
function initializeChat() {
    console.log('Initializing chat...');
    
    try {
        const root = document.getElementById('root');
        if (!root) {
            throw new Error('Root element not found');
        }
        console.log('Root element found');

        // Render the Chat component
        render(
            <Chat 
                vscode={vscode}
                onSendMessage={(message) => {
                    console.log('Sending message:', message);
                    vscode.postMessage({ type: 'sendMessage', message });
                    return Promise.resolve();
                }}
            />,
            root
        );
        console.log('Chat component rendered');
    } catch (error) {
        console.error('Error initializing chat:', error);
        // Report error back to extension
        vscode.postMessage({ 
            type: 'error', 
            message: error instanceof Error ? error.message : 'Failed to initialize chat'
        });
    }
}

// Start initialization when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeChat);
} else {
    initializeChat();
} 