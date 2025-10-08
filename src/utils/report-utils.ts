import { LINK_TYPE_NAMES } from './link-classifier.js';

/**
 * Helper to format date with UTC timestamp for client-side conversion
 */
export function formatReportDate(): string {
  const now = new Date();
  const utcTimestamp = now.toISOString();
  // Return span with data attribute for JavaScript conversion
  return `<span class="report-timestamp" data-utc="${utcTimestamp}">Loading...</span>`;
}

/**
 * Helper to inject link type names into data-static.js content
 */
export function injectlinkTypeNames(content: string): string {
  const linkTypeNamesJson = JSON.stringify(LINK_TYPE_NAMES, null, 2).split('\n').map((line, i) => i === 0 ? line : '  ' + line).join('\n');
  const injection = `  linkTypeNames: ${linkTypeNamesJson},\n`;

  // Replace the injection point comment with the actual data
  return content.replace(
    /  \/\/ LINK_TYPE_NAMES_INJECTION_POINT[\s\S]*?(?=  graph_node_icons:)/,
    injection + '\n'
  );
}