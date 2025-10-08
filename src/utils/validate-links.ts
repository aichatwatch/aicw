/**
 * Validates and filters links to ensure they are actual domains/URLs
 * Removes invalid entries like single words without TLDs
 */

// Domain validation regex - easily adjustable at the top
// Pattern requirements:
// - Must start with alphanumeric character
// - Can have hyphens in the middle (not at start/end of each segment)
// - Must contain at least one dot
// - Must end with a valid TLD (2+ letters after the last dot)
// Examples that match: example.com, sub.example.org, my-site.co.uk, api.service.io
// Examples that don't match: to, ko, min, medellin, word, singleword
const DOMAIN_VALIDATION_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/;

// URL with protocol regex for full URLs
const URL_WITH_PROTOCOL_REGEX = /^(https?|ftp):\/\/.+$/;

export function isValidLink(link: string): boolean {
  if (!link || typeof link !== 'string') return false;
  
  // Trim and lowercase for checking
  const cleaned = link.trim().toLowerCase();
  
  // Skip if empty or too short (min domain would be "x.co" = 4 chars)
  if (cleaned.length < 4) return false;
  
  // Check if it's a full URL (with protocol)
  if (URL_WITH_PROTOCOL_REGEX.test(cleaned)) {
    // For full URLs, just check they have a valid structure after the protocol
    const urlParts = cleaned.match(/^(https?|ftp):\/\/([^\/]+)/);
    if (urlParts && urlParts[2]) {
      const domain = urlParts[2];
      // Domain part must have at least one dot and valid TLD
      return domain.includes('.') && DOMAIN_VALIDATION_REGEX.test(domain);
    }
    return false;
  }
  
  // For domain-only sources OR URLs with paths
  // Check if it's a domain with optional path
  if (cleaned.includes('/')) {
    // Extract just the domain part before the first slash
    const domainPart = cleaned.split('/')[0];
    return DOMAIN_VALIDATION_REGEX.test(domainPart);
  }

  // For domain-only sources, must match the domain pattern
  // This ensures:
  // 1. Contains at least one dot (required for valid domain)
  // 2. Has a valid TLD of 2+ characters
  // 3. Follows proper domain naming conventions
  return DOMAIN_VALIDATION_REGEX.test(cleaned);
}

export function filterValidLinks(links: any[]): any[] {
  if (!Array.isArray(links)) return [];
  
  return links.filter(link => {
    // Handle array format ["domain", "category"]
    if (Array.isArray(link) && link.length >= 1) {
      return isValidLink(link[0]);
    }
    // Handle string format
    if (typeof link === 'string') {
      return isValidLink(link);
    }
    // Handle object format { value: "domain", ... }
    if (link && typeof link === 'object') {
      const candidate = typeof link.link === 'string' && link.link.trim() !== ''
        ? link.link
        : link.value;
      if (typeof candidate === 'string') {
        return isValidLink(candidate);
      }
    }
    return false;
  });
}
