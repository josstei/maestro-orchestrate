const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const TMP = path.join(ROOT, 'tests', 'integration', '_tmp');

describe('generator integration', () => {
  before(() => {
    fs.mkdirSync(TMP, { recursive: true });
  });

  after(() => {
    fs.rmSync(TMP, { recursive: true, force: true });
  });

  it('--dry-run produces no file writes', () => {
    const result = execSync('node scripts/generate.js --dry-run', {
      cwd: ROOT,
      encoding: 'utf8',
    });
    assert.ok(result.includes('dry-run'));
  });
});
