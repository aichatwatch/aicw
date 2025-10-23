/**
 * JavaScript Dependency Check
 *
 * Detects if content requires JavaScript (Client-Side Rendering)
 * AI bots typically cannot execute JavaScript, so SSR/static content is critical.
 *
 * Checks for CSR indicators without executing JavaScript:
 * - Empty root divs (React/Vue patterns)
 * - High script-to-content ratio
 * - Minimal body content
 * - Noscript warnings
 */

import { BaseVisibilityCheck, VisibilityCheckResult, PageCaptured } from './check-base.js';

// CSR framework patterns
const CSR_PATTERNS = [
  /<div\s+id=["'](root|app)["']\s*>\s*<\/div>/i,
  /<div\s+id=["']__next["']\s*>/i, // Next.js (can be SSR or CSR)
  /<div\s+id=["']__nuxt["']\s*>/i  // Nuxt.js (can be SSR or CSR)
];

// Framework detection
const FRAMEWORK_PATTERNS = [
  { name: 'React', regex: /react|ReactDOM/i },
  { name: 'Vue', regex: /vue\.js|createApp|Vue\.createApp/i },
  { name: 'Angular', regex: /ng-app|angular|@angular/i },
  { name: 'Svelte', regex: /svelte/i }
];

export class CheckJavaScriptDependency extends BaseVisibilityCheck {
  readonly name = 'JavaScript Dependency';

  protected async performCheck(url: string, pageCaptured?: PageCaptured): Promise<VisibilityCheckResult> {
    const browserHtml = pageCaptured?.browserHtmlDesktop;
    if (!browserHtml) {
      throw new Error('HTML content is required for JavaScript dependency check');
    }

    // Extract body content
    const bodyMatch = browserHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    const bodyContent = bodyMatch ? bodyMatch[1] : browserHtml;

    // Check for CSR indicators
    const hasEmptyRootDiv = CSR_PATTERNS.some(pattern => pattern.test(browserHtml));
    const hasNoscriptWarning = /<noscript>[\s\S]*?<\/noscript>/i.test(browserHtml);

    // Calculate content density
    const scriptTags: string[] = (bodyContent.match(/<script[\s\S]*?<\/script>/gi) as string[] | null) || [];
    const scriptSize: number = scriptTags.reduce((sum, tag: string) => sum + tag.length, 0);
    const totalBodySize = bodyContent.length;
    const contentSize = totalBodySize - scriptSize;

    // Check for semantic content
    const hasSemanticTags = /<(main|article|section|p|h[1-6])[^>]*>[\s\S]*?<\/\1>/i.test(bodyContent);
    const textContent = bodyContent
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, '')
      .trim();
    const textLength = textContent.length;

    // Detect frameworks
    const detectedFrameworks = FRAMEWORK_PATTERNS
      .filter(f => f.regex.test(browserHtml))
      .map(f => f.name);

    // Scoring logic
    let score = 10;
    const issues: string[] = [];

    // Critical: Empty root div (pure CSR)
    if (hasEmptyRootDiv) {
      score -= 5;
      issues.push('Empty root div detected (CSR pattern)');
    }

    // Minimal text content
    if (textLength < 500) {
      score -= 3;
      issues.push('Minimal text content');
    } else if (textLength < 2000) {
      score -= 1;
    }

    // No semantic HTML
    if (!hasSemanticTags) {
      score -= 2;
      issues.push('No semantic HTML tags');
    }

    // High script ratio (>50% of body is scripts)
    if (scriptSize > contentSize) {
      score -= 1;
      issues.push('High script-to-content ratio');
    }

    // Normalize score
    if (score < 0) score = 0;

    // Build details message
    let details: string;
    if (score >= 8) {
      details = `Content accessible without JavaScript (${textLength} chars)`;
    } else if (score === 0) {
      details = `Content requires JavaScript - AI bots cannot read it\n`;
      if (detectedFrameworks.length > 0) {
        details += `   Detected: ${detectedFrameworks.join(', ')}\n`;
      }
      details += `   Solution: Implement Server-Side Rendering (SSR)`;
    } else {
      details = `Hybrid rendering detected (score: ${score}/10)\n   Issues: ${issues.join(', ')}`;
      if (detectedFrameworks.length > 0) {
        details += `\n   Frameworks: ${detectedFrameworks.join(', ')}`;
      }
    }

    return {
      score,
      maxScore: this.maxScore,
      passed: score >= 7,
      details,
      metadata: {
        textLength,
        contentSize,
        scriptSize,
        hasEmptyRootDiv,
        hasSemanticTags,
        hasNoscriptWarning,
        detectedFrameworks,
        issues
      }
    };
  }
}
