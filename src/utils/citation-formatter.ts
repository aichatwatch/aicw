/**
 * Citation Formatter Utility
 *
 * Processes AI responses and enriches them with clickable citations and full content from annotations.
 * Supports multiple AI providers: OpenAI (with rich content), Perplexity (numbered refs), Claude (inline links).
 */

import { isUrlLikeTitle } from './url-utils.js';
import { CITATION_HEADER, CITATION_ITEM_FORMAT_WITH_URL} from '../config/constants.js';
import { replaceMacrosInTemplate } from './misc-utils.js';

/**
 * Citation data structure
 */
interface Citation {
  title: string;
  url: string;
  content?: string;  // Full content snippet from the source (NO truncation!)
}

/**
 * Result of citation extraction
 */
interface CitationResult {
  enrichedContent: string;  // Content with inline citation links
  citationsFooter: string;  // Citations section to append
}

/**
 * Decode HTML entities in text
 * Handles common entities like &gt;, &lt;, &amp;, &quot;, &#39;
 */
function decodeHtmlEntities(text: string): string {
  if (!text) return text;

  return text
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'");
}

/**
 * Extract and process citations from AI response
 *
 * This function handles multiple citation formats:
 * - OpenAI: annotations with rich content snippets
 * - Perplexity: numbered references [[1]] with citations array
 * - Claude: inline links (no special processing needed)
 *
 * @param responseData - Complete AI API response object
 * @param answerContent - The main answer text content
 * @returns Object with enriched content and citations footer
 */
export async function formatAnswerWithCitations(responseData: any, answerContent: string): Promise<CitationResult> {
  // Check if response has valid structure
  const message = responseData?.choices?.[0]?.message;
  if (!message) {
    return { enrichedContent: answerContent, citationsFooter: '' };
  }

  // Build a map of citations by index for numbered references
  const citationsByIndex: Map<number, Citation> = new Map();
  const uniqueCitations: Map<string, Citation> = new Map();

  // =========================================================================
  // STEP 1: Process root-level citations array (Perplexity format)
  // =========================================================================
  if (responseData.citations && Array.isArray(responseData.citations)) {
    responseData.citations.forEach((url: string, index: number) => {
      if (url) {
        // For root-level citations, we only have URLs, no titles or content
        // Index is 1-based for user-facing references
        citationsByIndex.set(index + 1, {
          title: url, // Will be detected as URL-like by isUrlLikeTitle
          url: url
        });
      }
    });
  }

  // =========================================================================
  // STEP 2: Process annotations with titles and CONTENT (OpenAI format)
  // =========================================================================
  if (message.annotations && Array.isArray(message.annotations)) {
    message.annotations.forEach((annotation: any, index: number) => {
      if (annotation.type === 'url_citation' && annotation.url_citation) {
        const { url, title, content } = annotation.url_citation;
        if (url) {
          // Decode HTML entities in content
          const decodedContent = content ? decodeHtmlEntities(content) : undefined;

          // Annotations are 1-based
          citationsByIndex.set(index + 1, {
            title: title || url,
            url: url,
            content: decodedContent  // Include FULL content, NO truncation
          });
        }
      }
    });
  }

  // =========================================================================
  // STEP 3: Collect citations from message.citations field
  // =========================================================================
  const citationSources = [message.citations];
  for (const citations of citationSources) {
    if (!citations || !Array.isArray(citations)) {
      continue;
    }
    for (const citation of citations) {
      if (citation.type === 'url_citation' && citation.url_citation) {
        const { url, title, content } = citation.url_citation;
        if (url && !uniqueCitations.has(url)) {
          const decodedContent = content ? decodeHtmlEntities(content) : undefined;
          uniqueCitations.set(url, {
            title: title || 'Untitled',
            url: url,
            content: decodedContent
          });
        }
      }
    }
  }

  // =========================================================================
  // STEP 4: Handle Perplexity's direct API format (search_results)
  // =========================================================================
  if (message.search_results && Array.isArray(message.search_results)) {
    for (const result of message.search_results) {
      if (result.url && !uniqueCitations.has(result.url)) {
        uniqueCitations.set(result.url, {
          title: result.title || 'Untitled',
          url: result.url,
          content: result.content ? decodeHtmlEntities(result.content) : undefined
        });
      }
    }
  }

  // =========================================================================
  // STEP 5: Handle OpenAI/Azure's direct API format (context.citations)
  // =========================================================================
  if (message.context?.citations && Array.isArray(message.context.citations)) {
    for (const citation of message.context.citations) {
      if (citation.url && !uniqueCitations.has(citation.url)) {
        uniqueCitations.set(citation.url, {
          title: citation.title || 'Untitled',
          url: citation.url,
          content: citation.content ? decodeHtmlEntities(citation.content) : undefined
        });
      }
    }
  }

  // =========================================================================
  // STEP 6: Enrich content with inline clickable references
  // =========================================================================

  // Check if content has numbered references like [1], [2], etc. that are NOT already linked
  const numberedRefPattern = /\[(\d+)\](?!\()/g;
  const hasNumberedRefs = numberedRefPattern.test(answerContent);

  let enrichedContent = answerContent;
  const usedCitationIndices = new Set<number>();

  // If we have numbered references and citations by index, enrich the content
  if (hasNumberedRefs && citationsByIndex.size > 0) {
    // Find all numbered references and process them backwards
    const matches = Array.from(answerContent.matchAll(/\[(\d+)\](?!\()/g));

    // Sort matches by position (descending) to process backwards
    matches.sort((a, b) => (b.index ?? 0) - (a.index ?? 0));

    // Process each match
    for (const match of matches) {
      const refNum = parseInt(match[1]);
      const citation = citationsByIndex.get(refNum);

      if (citation && match.index !== undefined) {
        // Determine the replacement format
        let replacement: string;
        if (isUrlLikeTitle(citation.url, citation.title)) {
          // Use double brackets to preserve [N] appearance when rendered
          replacement = `[[${refNum}]](${citation.url})`;
        } else {
          // Use the title as the link text if it's meaningful
          replacement = `[${citation.title}](${citation.url})`;
        }

        // Replace in content (safe because we're processing backwards)
        enrichedContent = enrichedContent.substring(0, match.index) +
                         replacement +
                         enrichedContent.substring(match.index + match[0].length);

        usedCitationIndices.add(refNum);
      }
    }
  }

  // =========================================================================
  // STEP 7: Build citations footer with FULL content (NO truncation)
  // =========================================================================
  let citationsFooter = '';

  // For numbered references, show ALL citations in their original order (like academic papers)
  if (hasNumberedRefs && citationsByIndex.size > 0) {
    citationsFooter = `\n\n${CITATION_HEADER}\n`;

    // Sort citations by their index to maintain proper numbering
    const sortedCitations = Array.from(citationsByIndex.entries())
      .sort((a, b) => a[0] - b[0]);

    // List all citations with their original numbers and FULL content
    for (const [index, citation] of sortedCitations) {
      // Format title as bold link
        citationsFooter += `\n${await replaceMacrosInTemplate(
          CITATION_ITEM_FORMAT_WITH_URL, { 
          '{{INDEX}}': index.toString(), 
          '{{TITLE}}': citation.title || citation.url,
          '{{URL}}': citation.url 
          }
        )}\n`;

      // Add FULL content if available (NO truncation or limits!)
      if (citation.content) {
        citationsFooter += `\n${citation.content}\n`;
      }
    }
  } else if (citationsByIndex.size > 0) {
    // For OpenAI responses with annotations but no numbered refs in content
    // Show ALL annotations with their content (important context!)
    citationsFooter = `\n\n${CITATION_HEADER}\n`;

    // Sort citations by their index
    const sortedCitations = Array.from(citationsByIndex.entries())
      .sort((a, b) => a[0] - b[0]);

    // List all citations with FULL content
    for (const [index, citation] of sortedCitations) {
      // Format title as bold link
      citationsFooter += `\n${await replaceMacrosInTemplate(
        CITATION_ITEM_FORMAT_WITH_URL, { 
        '{{INDEX}}': index.toString(), 
        '{{TITLE}}': citation.title || citation.url,
        '{{URL}}': citation.url 
        }
      )}\n`;

      // Add FULL content if available (NO truncation!)
      if (citation.content) {
        citationsFooter += `\n${citation.content}\n`;
      }
    }
  } else {
    // For other cases (no annotations), only show citations not in content
    const unusedCitations: Citation[] = [];

    // Collect citations that aren't already in the enriched content
    for (const [url, citation] of uniqueCitations) {
      if (!enrichedContent.includes(url)) {
        unusedCitations.push(citation);
      }
    }

    // Build footer with bullet points for unused citations
    if (unusedCitations.length > 0) {
      citationsFooter = `\n\n${CITATION_HEADER}\n`;
      for (const citation of unusedCitations) {
        citationsFooter += `\n${await replaceMacrosInTemplate(
          CITATION_ITEM_FORMAT_WITH_URL, { 
          '{{INDEX}}': (unusedCitations.indexOf(citation) + 1).toString(), 
          '{{TITLE}}': citation.title || citation.url,
          '{{URL}}': citation.url 
          }
        )}\n`;
        // Add FULL content if available (NO truncation!)
        if (citation.content) {
          citationsFooter += `\n  ${citation.content}\n`;
        }
      }
    }
  }

  return { enrichedContent, citationsFooter };
}

/**
 * Main export: Format answer with complete citations
 *
 * @param responseData - Complete AI API response object
 * @returns Formatted markdown string with enriched content and citations
 */
export async function formatAnswer(responseData: any): Promise<string> {
  const answerContent = responseData?.choices?.[0]?.message?.content || '';
  const { enrichedContent, citationsFooter } = await formatAnswerWithCitations(responseData, answerContent);
  return enrichedContent + citationsFooter;
}
