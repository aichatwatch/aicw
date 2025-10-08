/**
 * Input validation and sanitization utilities
 */

import path from 'path';
import { UserFriendlyError, ErrorCode } from './error-handler.js';

/**
 * Validation result interface
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export function isValidDate(dateStr: string): boolean {
  const date = new Date(dateStr);
  return !isNaN(date.getTime());
}

/**
 * Validate project name
 */
export function validateProjectName(name: string): ValidationResult {
  const errors: string[] = [];

  // Check if empty
  if (!name || name.trim().length === 0) {
    errors.push('Project name cannot be empty');
    return { isValid: false, errors };
  }

  // Check length
  if (name.length > 100) {
    errors.push('Project name must be 100 characters or less');
  }

  if (name.length < 2) {
    errors.push('Project name must be at least 2 characters');
  }

  // Check for path traversal attempts
  const pathSegments = ['..', '.', '/', '\\'];
  if (pathSegments.some(seg => name === seg || name.includes(`${seg}/`) || name.includes(`${seg}\\`))) {
    errors.push('Project name cannot contain path segments like ".." or "/"');
  }

  // Check for reserved names (Windows)
  const reserved = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4',
                    'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2',
                    'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];
  if (reserved.includes(name.toUpperCase())) {
    errors.push('This name is reserved by the system');
  }

  // Check for invalid characters
  const invalidChars = /[<>:"|?*\\\/]/;
  if (invalidChars.test(name)) {
    errors.push('Project name contains invalid characters: < > : " | ? * \\ /');
  }

  // Check for control characters
  const hasControlChars = /[\x00-\x1F\x7F]/.test(name);
  if (hasControlChars) {
    errors.push('Project name contains invalid control characters');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validate file path (for user-provided paths)
 */
export function validateFilePath(filePath: string): ValidationResult {
  const errors: string[] = [];

  if (!filePath || filePath.trim().length === 0) {
    errors.push('File path cannot be empty');
    return { isValid: false, errors };
  }

  // Check for null bytes (security issue)
  if (filePath.includes('\0')) {
    errors.push('File path contains invalid null bytes');
  }

  // Check if absolute path when it shouldn't be
  if (path.isAbsolute(filePath) && !isAllowedAbsolutePath(filePath)) {
    errors.push('Absolute paths to system directories are not allowed');
  }

  // Check for suspicious patterns
  const suspicious = [
    /\.\.\//g,           // Path traversal
    /\.\.\\/, // Windows path traversal
    /[<>|"]/,            // Shell metacharacters
    /[\x00-\x1F\x7F]/    // Control characters
  ];

  for (const pattern of suspicious) {
    if (pattern.test(filePath)) {
      errors.push('File path contains suspicious characters or patterns');
      break;
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Check if absolute path is allowed
 */
function isAllowedAbsolutePath(filePath: string): boolean {
  const normalized = path.normalize(filePath).toLowerCase();

  // Deny access to system directories
  const deniedPaths = [
    '/etc',
    '/sys',
    '/proc',
    '/dev',
    '/boot',
    '/root',
    'c:\\windows',
    'c:\\program files',
    'c:\\programdata'
  ];

  return !deniedPaths.some(denied => normalized.startsWith(denied));
}

/**
 * Sanitize question text
 */
export function sanitizeQuestion(question: string): string {
  return question
    .trim()
    // Remove control characters except newlines and tabs
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    // Limit length
    .substring(0, 1000);
}

/**
 * Validate question text
 */
export function validateQuestion(question: string): ValidationResult {
  const errors: string[] = [];

  if (!question || question.trim().length === 0) {
    errors.push('Question cannot be empty');
    return { isValid: false, errors };
  }

  if (question.length > 1000) {
    errors.push('Question must be 1000 characters or less');
  }

  if (question.length < 5) {
    errors.push('Question must be at least 5 characters');
  }

  // Check for potential injection attempts
  const injectionPatterns = [
    /\{\{.*\}\}/,        // Template injection
    /<script.*>/i,       // Script tags
    /javascript:/i,      // JavaScript protocol
    /on\w+\s*=/i        // Event handlers
  ];

  for (const pattern of injectionPatterns) {
    if (pattern.test(question)) {
      errors.push('Question contains potentially unsafe content');
      break;
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validate model ID
 */
export function validateModelId(modelId: string): ValidationResult {
  const errors: string[] = [];

  if (!modelId || modelId.trim().length === 0) {
    errors.push('Model ID cannot be empty');
    return { isValid: false, errors };
  }

  // Model IDs should only contain safe characters
  const validPattern = /^[a-zA-Z0-9_\-\/\.:]+$/;
  if (!validPattern.test(modelId)) {
    errors.push('Model ID contains invalid characters');
  }

  if (modelId.length > 100) {
    errors.push('Model ID is too long');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validate URL
 */
export function validateUrl(url: string): ValidationResult {
  const errors: string[] = [];

  try {
    const parsed = new URL(url);

    // Only allow http and https
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      errors.push('URL must use HTTP or HTTPS protocol');
    }

    // Check for localhost/private IPs (security)
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.')) {
      errors.push('URLs to local/private addresses are not allowed');
    }
  } catch (e) {
    errors.push('Invalid URL format');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Sanitize environment variable value
 */
export function sanitizeEnvValue(value: string): string {
  return value
    .trim()
    // Remove quotes if they wrap the entire value
    .replace(/^["'](.*)["']$/, '$1')
    // Remove control characters
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

/**
 * Wrapper to validate and throw user-friendly errors
 */
export function validateOrThrow(
  value: string,
  validator: (value: string) => ValidationResult,
  errorCode: ErrorCode
): void {
  const result = validator(value);

  if (!result.isValid) {
    throw new UserFriendlyError(
      errorCode,
      result.errors.join('; ')
    );
  }
}