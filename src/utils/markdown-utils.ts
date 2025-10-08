import { marked } from 'marked';
import { logger } from './compact-logger.js';

// Configure marked options for safe HTML rendering
marked.setOptions({
  breaks: true, // Enable line breaks
  gfm: true, // GitHub Flavored Markdown
});

/**
 * Render markdown to HTML using marked library
 * Falls back to escaped text in <pre> tag if rendering fails
 */
export function renderMarkdownToHtml(markdown: string): string {
  try {
    // marked.parse can be sync or async, we'll use parseSync for synchronous operation
    const result = marked.parse(markdown);
    // Handle both sync and async results
    if (typeof result === 'string') {
      return result;
    } else {
      // If it returns a promise (shouldn't happen with our config), fallback to raw
      logger.warn('Unexpected async response from marked.parse, using raw markdown');
      return `<pre>${markdown.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`;
    }
  } catch (error) {
    logger.warn(`Error rendering markdown: ${error}`);
    // If rendering fails, return escaped text in a pre tag
    return `<pre>${markdown.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`;
  }
}
