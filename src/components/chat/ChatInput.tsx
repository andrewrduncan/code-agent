import { h } from 'preact';
import { useState, useRef } from 'preact/hooks';

interface ChatInputProps {
    onSendMessage: (message: string) => Promise<void>;
    disabled: boolean;
}

export function ChatInput({ onSendMessage, disabled }: ChatInputProps) {
    const [message, setMessage] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const handleSubmit = () => {
        const trimmedMessage = message.trim();
        if (trimmedMessage && !disabled) {
            onSendMessage(trimmedMessage);
            setMessage('');
            if (textareaRef.current) {
                textareaRef.current.style.height = 'auto';
            }
        }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey && !disabled) {
            e.preventDefault();
            handleSubmit();
        }
    };

    return (
        <div class="input-section">
            <div class="input-container">
                <textarea
                    ref={textareaRef}
                    value={message}
                    onInput={(e) => setMessage((e.target as HTMLTextAreaElement).value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type a message..."
                    rows={3}
                    disabled={disabled}
                />
                <button 
                    onClick={handleSubmit}
                    disabled={disabled || !message.trim()}
                >
                    Send
                </button>
            </div>
        </div>
    );
} 