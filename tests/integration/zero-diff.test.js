const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { execSync } = require('node:child_process');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');

describe('zero-diff validation', () => {
  it('generator output matches committed files exactly', () => {
    execSync('node scripts/generate.js', { cwd: ROOT, encoding: 'utf8' });
    const diff = execSync('git diff --name-only', { cwd: ROOT, encoding: 'utf8' }).trim();
    if (diff) {
      const details = execSync('git diff --stat', { cwd: ROOT, encoding: 'utf8' });
      assert.fail(`Generator output differs from committed files:\n${diff}\n\n${details}`);
    }
  });
});
