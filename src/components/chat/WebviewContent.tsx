import { h } from 'preact';
import { Chat } from './Chat';

interface WebviewContentProps {
    styleUri: string;
}

export function WebviewContent({ styleUri }: WebviewContentProps) {
    const handleSendMessage = async (message: string) => {
        vscode.postMessage({ type: 'sendMessage', message });
        return Promise.resolve();
    };

    return (
        <div id="root">
            <Chat 
                vscode={acquireVsCodeApi()}
                onSendMessage={handleSendMessage}
            />
        </div>
    );
} 