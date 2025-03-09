import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';

interface ChatControlsProps {
    mode: 'chat' | 'agent';
    model: string;
    availableModels: string[];
    onModeChange: (mode: 'chat' | 'agent') => void;
    onModelChange: (model: string) => void;
}

export function ChatControls({ 
    mode, 
    model, 
    availableModels, 
    onModeChange, 
    onModelChange 
}: ChatControlsProps) {
    return (
        <div class="chat-controls">
            <div class="control-group">
                <select 
                    value={mode} 
                    onChange={(e) => onModeChange(e.currentTarget.value as 'chat' | 'agent')}
                    class="mode-select"
                >
                    <option value="chat">Chat</option>
                    <option value="agent">Agent</option>
                </select>
            </div>
            <div class="control-group">
                <select 
                    value={model} 
                    onChange={(e) => onModelChange(e.currentTarget.value)}
                    class="model-select"
                >
                    {availableModels.map(m => (
                        <option key={m} value={m}>{m}</option>
                    ))}
                </select>
            </div>
        </div>
    );
} 