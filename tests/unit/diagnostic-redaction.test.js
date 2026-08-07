import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { redactObject, redactText } from '../../dist/src/tooling/diagnostics/redaction.js';

describe('diagnostic redaction', () => {
  it('redacts home directory paths from string text', () => {
    const text = 'Saved file to /home/josstei/Development/maestro and /Users/admin/docs';
    const sanitized = redactText(text);
    assert.equal(sanitized.includes('/home/josstei'), false);
    assert.equal(sanitized.includes('/Users/admin'), false);
    assert.equal(sanitized.includes('[HOME]'), true);
  });

  it('redacts sensitive API tokens and keys', () => {
    const text = 'Using token ghp_1234567890abcdef1234567890abcdef1234 and key sk-1234567890abcdef1234567890abcdef1234';
    const sanitized = redactText(text);
    assert.equal(sanitized.includes('ghp_1234567890abcdef1234567890abcdef1234'), false);
    assert.equal(sanitized.includes('sk-1234567890abcdef1234567890abcdef1234'), false);
    assert.equal(sanitized.includes('[REDACTED_GITHUB_TOKEN]'), true);
    assert.equal(sanitized.includes('[REDACTED_API_KEY]'), true);
  });

  it('recursively redacts objects and sensitive key names', () => {
    const input = {
      user_home: '/home/josstei/app',
      api_secret: 'super-secret-key-value-12345',
      nested: {
        github_token: 'ghp_1234567890abcdef1234567890abcdef1234',
        safe_field: 'public value',
      },
    };

    const sanitized = redactObject(input);
    assert.equal(sanitized.user_home.includes('/home/josstei'), false);
    assert.equal(sanitized.api_secret, '[REDACTED_SECRET]');
    assert.equal(sanitized.nested.github_token, '[REDACTED_GITHUB_TOKEN]');
    assert.equal(sanitized.nested.safe_field, 'public value');
  });
});
