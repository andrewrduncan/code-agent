import { h } from 'preact';
import { Message } from './Message';

interface MessageListProps {
    messages: Array<{
        role: 'user' | 'assistant' | 'error';
        content: string;
    }>;
    isLoading: boolean;
}

export function MessageList({ messages, isLoading }: MessageListProps) {
    return (
        <div class="messages-container">
            <div class="messages">
                {messages.map((message, index) => (
                    <Message 
                        key={index}
                        role={message.role}
                        content={message.content}
                    />
                ))}
                {isLoading && (
                    <div class="message assistant loading">
                        <div class="loading-indicator">
                            <span class="dot">.</span>
                            <span class="dot">.</span>
                            <span class="dot">.</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
} 