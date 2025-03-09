import { marked } from 'marked';

marked.setOptions({
  gfm: true,
  breaks: true
});

export function parseMarkdown(content: string): string {
  try {
    const result = marked(content);
    return typeof result === 'string' ? result : content;
  } catch (error) {
    console.error('Error parsing markdown:', error);
    return content;
  }
} 