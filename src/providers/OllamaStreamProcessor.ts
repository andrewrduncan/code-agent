import { StreamingOptions } from '../types/llm-interfaces';
import { OllamaEventEmitter } from '../types/events';
import { readStream } from './StreamingUtils';
import { OllamaError, OllamaTimeoutError, OllamaResponseError } from '../types/errors';

export class OllamaStreamProcessor {
    private static readonly INIT_TIMEOUT = 30000; // 30 seconds

    constructor(
        private eventEmitter: OllamaEventEmitter,
        private options: StreamingOptions
    ) {}

    async processStream(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
        let responseContent = '';
        let receivedFirstResponse = false;
        let initializationTimeout: NodeJS.Timeout | null = null;

        try {
            // Set a timeout for model initialization
            const timeoutPromise = new Promise<never>((_, reject) => {
                initializationTimeout = setTimeout(() => {
                    reject(new OllamaTimeoutError());
                }, OllamaStreamProcessor.INIT_TIMEOUT);
            });

            // Create a promise for the stream processing
            const processPromise = this.processStreamData(reader, (firstResponse) => {
                if (firstResponse && !receivedFirstResponse) {
                    receivedFirstResponse = true;
                    if (initializationTimeout) {
                        clearTimeout(initializationTimeout);
                        initializationTimeout = null;
                    }
                }
            }, (content) => {
                // Replace the entire content instead of appending
                responseContent = content;
            });

            // Race between timeout and processing
            await Promise.race([timeoutPromise, processPromise]);
            
            return responseContent;
        } finally {
            if (initializationTimeout) {
                clearTimeout(initializationTimeout);
            }
        }
    }

    private processThinkingContent(content: string): { thought: string | null; remainingContent: string } {
        // Look for thinking content in both formats, with improved regex
        const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>|```think\n([\s\S]*?)```/);
        console.debug('Processing thinking content:', { content, match: thinkMatch });
        if (!thinkMatch) {
            return { thought: null, remainingContent: content };
        }

        const thought = (thinkMatch[1] || thinkMatch[2])?.trim();
        // Remove the thinking block from the content
        const remainingContent = content.replace(thinkMatch[0], '').trim();
        
        console.debug('Extracted thinking:', { thought, remainingContent });
        return { thought, remainingContent };
    }

    private processCodeBlocks(content: string): string {
        return content.replace(/```(\w*)\n(.*?)```/gs, (match: string, lang: string, code: string) => {
            if (lang === 'think') return '';
            return `\`\`\`${lang}\n${code.trim()}\n\`\`\``;
        });
    }

    private processHtmlTags(content: string): string {
        // Only escape < and > for HTML safety, preserve other characters
        return content
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    private formatContent(content: string): string {
        // First process thinking content without emitting
        const { remainingContent } = this.processThinkingContent(content);

        // Then process code blocks
        let processedContent = this.processCodeBlocks(remainingContent);

        // Finally escape HTML in non-code content, preserving code blocks
        processedContent = processedContent.replace(/```(\w*)\n([\s\S]*?)```/gs, (match) => {
            // Preserve code blocks completely
            return match;
        }).replace(/[^]*?(?=```|$)/g, (text) => {
            // Only process HTML in non-code sections
            return this.processHtmlTags(text);
        });

        return processedContent.trim();
    }

    private async processStreamData(
        reader: ReadableStreamDefaultReader<Uint8Array>,
        onFirstResponse: (isFirst: boolean) => void,
        onContent: (content: string) => void
    ): Promise<void> {
        let buffer = '';
        let currentResponse = '';
        let isFirstChunk = true;
        let lastProcessedResponse = '';
        let hasThinkingContent = false;
        let lastThinkingContent = '';
        
        try {
            for await (const chunk of readStream(reader)) {
                // Add new chunk to buffer
                buffer += chunk;
                
                // Split on newlines, keeping any partial line in the buffer
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // Keep the last (potentially partial) line in buffer
                
                for (const line of lines.filter(l => l.trim())) {
                    try {
                        const data = JSON.parse(line);
                        
                        if (data.message?.content) {
                            // Handle first response
                            if (isFirstChunk) {
                                onFirstResponse(true);
                                isFirstChunk = false;
                            }

                            // Check for thinking content before appending
                            const hasNewThinking = data.message.content.includes('<think>') || 
                                                 data.message.content.includes('```think');
                            
                            // If we find new thinking content, process and emit it immediately
                            if (hasNewThinking) {
                                const { thought } = this.processThinkingContent(data.message.content);
                                if (thought && thought !== lastThinkingContent) {
                                    lastThinkingContent = thought;
                                    hasThinkingContent = true;
                                    console.debug('Emitting thinking:', thought);
                                    this.eventEmitter.emit({
                                        type: 'chat:thinking',
                                        payload: thought
                                    });
                                    if (this.options.onThinking) {
                                        this.options.onThinking(thought);
                                    }
                                }
                            }

                            // Append new content to current response
                            currentResponse += data.message.content;

                            // Trim if response is getting too large
                            if (currentResponse.length > 10000) {
                                const trimmed = this.formatContent(currentResponse);
                                currentResponse = trimmed;
                            }

                            // Process and format the content
                            const processedResponse = this.formatContent(currentResponse);

                            // Only emit if content has changed
                            if (processedResponse && processedResponse !== lastProcessedResponse) {
                                onContent(processedResponse);
                                this.eventEmitter.emit({
                                    type: 'chat:response',
                                    payload: { 
                                        content: processedResponse,
                                        done: data.done || false 
                                    }
                                });
                                lastProcessedResponse = processedResponse;
                            }

                            // Update loading state
                            if (this.options?.onLoadingStateChange) {
                                this.options.onLoadingStateChange({
                                    type: 'thinking',
                                    message: hasThinkingContent ? 'Processing...' : 'Thinking...'
                                });
                            }

                            // Clear response if we're done
                            if (data.done) {
                                currentResponse = '';
                                buffer = '';
                                lastProcessedResponse = '';
                                hasThinkingContent = false;
                                lastThinkingContent = '';
                            }
                        }
                    } catch (e) {
                        console.error('Error processing chunk:', e, '\nLine:', line);
                        throw new OllamaResponseError(`Failed to parse response: ${e instanceof Error ? e.message : String(e)}`);
                    }
                }
            }
        } catch (error) {
            console.error('Stream processing error:', error);
            if (error instanceof OllamaError) {
                throw error;
            }
            throw new OllamaError(error instanceof Error ? error.message : String(error));
        } finally {
            // Ensure we clear any remaining state
            buffer = '';
            currentResponse = '';
            lastProcessedResponse = '';
        }
    }

    async processModelPull(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
        let totalSize = 0;
        let downloadedSize = 0;
        let lastUpdate = Date.now();
        let speed = 0;

        try {
            for await (const chunk of readStream(reader)) {
                const lines = chunk.split('\n').filter(line => line.trim());

                for (const line of lines) {
                    try {
                        const data = JSON.parse(line);
                        
                        if (data.total) {
                            totalSize = parseInt(data.total);
                        }
                        if (data.completed) {
                            const now = Date.now();
                            const timeDiff = (now - lastUpdate) / 1000;
                            const sizeDiff = parseInt(data.completed) - downloadedSize;
                            speed = sizeDiff / timeDiff;
                            
                            downloadedSize = parseInt(data.completed);
                            lastUpdate = now;

                            this.eventEmitter.emit({
                                type: 'model:loading',
                                payload: {
                                    status: data.status || 'downloading',
                                    progress: totalSize > 0 ? Math.round((downloadedSize / totalSize) * 100) : 0,
                                    total: totalSize,
                                    current: downloadedSize,
                                    details: {
                                        speed,
                                        timeRemaining: speed > 0 ? Math.round((totalSize - downloadedSize) / speed) : undefined,
                                        phase: data.status
                                    }
                                }
                            });
                        }
                    } catch (e) {
                        throw new OllamaResponseError(`Failed to parse model pull response: ${e instanceof Error ? e.message : String(e)}`);
                    }
                }
            }
        } catch (error) {
            if (error instanceof OllamaError) {
                throw error;
            }
            throw new OllamaError(error instanceof Error ? error.message : String(error));
        }
    }
} 