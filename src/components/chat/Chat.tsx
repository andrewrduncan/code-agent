import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { ChatControls } from './ChatControls';

interface Message {
    role: 'user' | 'assistant' | 'error';
    content: string;
}

interface ChatProps {
    vscode: any;
    onSendMessage: (message: string) => Promise<void>;
}

export function Chat({ vscode, onSendMessage }: ChatProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [mode, setMode] = useState<'chat' | 'agent'>('chat');
    const [model, setModel] = useState<string>('');
    const [availableModels, setAvailableModels] = useState<string[]>([]);

    useEffect(() => {
        // Listen for messages from the extension
        const messageHandler = (event: MessageEvent) => {
            const message = event.data;
            switch (message.type) {
                case 'addMessage':
                    setMessages(prev => [...prev, message.message]);
                    break;
                case 'setLoading':
                    setIsLoading(message.loading);
                    break;
                case 'updateModels':
                    setAvailableModels(message.models);
                    if (message.currentModel) {
                        setModel(message.currentModel);
                    }
                    break;
            }
        };

        window.addEventListener('message', messageHandler);
        
        // Request available models on mount
        vscode.postMessage({ type: 'getModels' });
        
        return () => window.removeEventListener('message', messageHandler);
    }, []);

    const handleModeChange = (newMode: 'chat' | 'agent') => {
        setMode(newMode);
        vscode.postMessage({ type: 'setMode', mode: newMode });
    };

    const handleModelChange = (newModel: string) => {
        setModel(newModel);
        vscode.postMessage({ type: 'setModel', model: newModel });
    };

    return (
        <div class="chat-container">
            <MessageList messages={messages} isLoading={isLoading} />
            <div class="input-container-wrapper">
                <ChatInput 
                    onSendMessage={onSendMessage}
                    disabled={isLoading}
                />
                <ChatControls
                    mode={mode}
                    model={model}
                    availableModels={availableModels}
                    onModeChange={handleModeChange}
                    onModelChange={handleModelChange}
                />
            </div>
        </div>
    );
} 