

const MARKDOWN_CODE_BLOCK_PATTERNS = [
    '```json',
    '```csv',
    '```'
];

/**
 * Clean content by removing markdown code blocks
 * 
 * @param content - Raw content that might contain markdown
* @returns Cleaned content
*/
export function cleanContentFromAI(content: string): string {
    let cleanContent = content;

    // Remove markdown code blocks with optional language identifiers
    // Handles: ```javascript, ```js, ```json, ```csv, ```typescript, ```ts, or just ```
    cleanContent = cleanContent.replace(/```(?:javascript|js|json|csv|typescript|ts)?\s*/gi, '');

    return cleanContent.trim();
  }
