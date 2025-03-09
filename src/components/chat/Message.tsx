import { h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { marked } from 'marked';

marked.setOptions({
    gfm: true,
    breaks: true
});

export interface MessageProps {
    role: 'user' | 'assistant' | 'error';
    content: string;
}

function simpleMarkdown(text: string): string {
    if (!text) return '';
    
    // Escape HTML to prevent XSS
    text = text.replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    } as { [key: string]: string })[char]);
    
    // Handle code blocks
    text = text.replace(/\`\`\`([\s\S]*?)\`\`\`/g, (_, code) => {
        return '<pre><code>' + code.trim() + '</code></pre>';
    });
    
    // Handle inline code
    text = text.replace(/\`([^\`]+)\`/g, '<code>$1</code>');
    
    // Handle bold
    text = text.replace(/\*\*([^\*]+)\*\*/g, '<strong>$1</strong>');
    
    // Handle italics
    text = text.replace(/\*([^\*]+)\*/g, '<em>$1</em>');
    
    // Handle links
    text = text.replace(/\[([^\]]+)\]\(([^\)]+)\)/g, '<a href="$2">$1</a>');
    
    // Handle lists
    text = text.replace(/^[\s]*[-*][\s]+(.+)$/gm, '<li>$1</li>');
    text = text.split(/\n/).map(line => {
        if (line.includes('<li>')) {
            return line;
        }
        return line ? '<p>' + line + '</p>' : '';
    }).join('\n');
    text = text.replace(/(<li>.*<\/li>\n*)+/g, '<ul>$&</ul>');
    
    return text;
}

function parseResponse(content: string) {
    const thinkingPatterns = [
        "Okay, let's see",
        "Let me analyze",
        "Let me think",
        "I should",
        "First,",
        "I need to",
        "Let's break this down",
        "I'll help you",
        "Let me",
        "I will",
        "I'm going to",
        "I can help",
        "I'll start by",
        "To solve this",
        "To answer this",
        "To address this"
    ];

    let hasThinking = false;
    let thinkingContent = '';
    let finalResponse = content;

    const paragraphs = content.split(/\n\n/);
    
    for (let i = 0; i < paragraphs.length; i++) {
        const paragraph = paragraphs[i];
        if (thinkingPatterns.some(pattern => paragraph.includes(pattern))) {
            hasThinking = true;
            thinkingContent += paragraph + '\n\n';
            finalResponse = paragraphs.slice(i + 1).join('\n\n');
        } else if (hasThinking) {
            if (!paragraph.includes('```') && !paragraph.startsWith('Here')) {
                thinkingContent += paragraph + '\n\n';
                finalResponse = paragraphs.slice(i + 1).join('\n\n');
            } else {
                break;
            }
        }
    }

    return { hasThinking, thinkingContent, finalResponse };
}

function renderMarkdown(content: string): string {
    const result = marked(content);
    return typeof result === 'string' ? result : content;
}

export function Message({ role, content }: MessageProps) {
    const messageRef = useRef<HTMLDivElement>(null);
    const [isThinkingExpanded, setIsThinkingExpanded] = useState(false);

    useEffect(() => {
        const element = messageRef.current;
        if (element && role === 'assistant') {
            try {
                const { hasThinking, thinkingContent, finalResponse } = parseResponse(content);
                
                if (hasThinking) {
                    const thinkingHtml = `
                        <div class="thinking ${isThinkingExpanded ? 'expanded' : ''}">
                            <div class="thinking-header" onclick="this.parentElement.classList.toggle('expanded')">
                                <span class="thinking-icon">▶</span>
                                Thinking Process
                            </div>
                            <div class="thinking-content">
                                ${renderMarkdown(thinkingContent)}
                            </div>
                        </div>
                        ${renderMarkdown(finalResponse)}
                    `;
                    element.innerHTML = thinkingHtml;

                    // Add click handler for the thinking header
                    const thinkingHeader = element.querySelector('.thinking-header');
                    if (thinkingHeader) {
                        thinkingHeader.addEventListener('click', () => {
                            setIsThinkingExpanded(!isThinkingExpanded);
                        });
                    }
                } else {
                    element.innerHTML = renderMarkdown(content);
                }
            } catch (error) {
                console.error('Error parsing markdown:', error);
                element.innerHTML = content;
            }
        }
    }, [content, role, isThinkingExpanded]);

    if (role !== 'assistant') {
        return (
            <div class={`message ${role}`}>
                <div class="message-content">
                    {content}
                </div>
            </div>
        );
    }

    return (
        <div class={`message ${role}`}>
            <div class="message-content" ref={messageRef} />
        </div>
    );
}