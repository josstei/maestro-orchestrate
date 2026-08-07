import os from 'node:os';

const SECRET_PATTERNS: Array<{ name: string; pattern: RegExp; replacement: string }> = [
  { name: 'Generic API Key / Secret Token', pattern: /(?:api[_-]?key|secret|token|password|auth|bearer)\s*[:=]\s*["']?([a-zA-Z0-9_\-]{20,})["']?/gi, replacement: '$1' },
  { name: 'GitHub Token', pattern: /gh[pousr]_[a-zA-Z0-9]{36}/g, replacement: '[REDACTED_GITHUB_TOKEN]' },
  { name: 'OpenAI / Anthropic Key', pattern: /(?:sk-[a-zA-Z0-9]{32,}|sk-ant-[a-zA-Z0-9_\-]{32,})/g, replacement: '[REDACTED_API_KEY]' },
  { name: 'JWT Token', pattern: /eyJ[a-zA-Z0-9_\-]{10,}\.eyJ[a-zA-Z0-9_\-]{10,}\.[a-zA-Z0-9_\-]{10,}/g, replacement: '[REDACTED_JWT]' },
];

/**
 * Sanitizes absolute user home directory paths and known secret patterns from text.
 */
export function redactText(text: string): string {
  if (!text || typeof text !== 'string') return text;

  let sanitized = text;

  // 1. Redact user home directory
  const homeDir = os.homedir();
  if (homeDir && homeDir !== '/') {
    const escapedHome = homeDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const homeRegex = new RegExp(escapedHome, 'g');
    sanitized = sanitized.replace(homeRegex, '[HOME]');
  }

  // Also catch common linux/mac home path patterns like /home/username or /Users/username
  sanitized = sanitized.replace(/\/home\/[a-zA-Z0-9_-]+/g, '[HOME]');
  sanitized = sanitized.replace(/\/Users\/[a-zA-Z0-9_-]+/g, '[HOME]');

  // 2. Redact secrets
  for (const { pattern, replacement } of SECRET_PATTERNS) {
    if (replacement.includes('$1')) {
      sanitized = sanitized.replace(pattern, (match, secretGroup) => {
        if (!secretGroup) return match;
        return match.replace(secretGroup, '[REDACTED_SECRET]');
      });
    } else {
      sanitized = sanitized.replace(pattern, replacement);
    }
  }

  return sanitized;
}

/**
 * Recursively redacts secrets and absolute home paths from objects or primitive values.
 */
export function redactObject<T>(input: T): T {
  if (input === null || input === undefined) return input;

  if (typeof input === 'string') {
    return redactText(input) as unknown as T;
  }

  if (Array.isArray(input)) {
    return input.map((item) => redactObject(item)) as unknown as T;
  }

  if (typeof input === 'object') {
    const copy: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('secret') ||
        lowerKey.includes('password') ||
        lowerKey.includes('apikey') ||
        lowerKey.includes('auth_token') ||
        lowerKey.includes('private_key')
      ) {
        copy[key] = '[REDACTED_SECRET]';
      } else {
        copy[key] = redactObject(value);
      }
    }
    return copy as unknown as T;
  }

  return input;
}
