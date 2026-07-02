'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { TRACKED_OUTPUT_EXEMPTIONS } = require('../../src/generator/generated-surface-inventory');

const ROOT = path.resolve(__dirname, '../..');
const outputs = execFileSync('node', ['scripts/generate.js', '--list-outputs'], { cwd: ROOT, encoding: 'utf8' })
  .trim().split('\n');

function checkIgnored(paths) {
  if (paths.length === 0) {
    return new Set();
  }

  try {
    const stdout = execFileSync('git', ['check-ignore', '--stdin', '--no-index'], {
      cwd: ROOT,
      input: paths.join('\n'),
      encoding: 'utf8',
    });
    return new Set(stdout.trim().split('\n').filter(Boolean));
  } catch (err) {
    if (typeof err.status === 'number' && err.status === 1) {
      return new Set(String(err.stdout || '').trim().split('\n').filter(Boolean));
    }
    throw err;
  }
}

const ignored = checkIgnored(outputs);
const tracked = new Set(
  execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n')
);

describe('generated output tracking contract', () => {
  it('every generator output is gitignored XOR exempted', () => {
    for (const out of outputs) {
      const exempt = TRACKED_OUTPUT_EXEMPTIONS.includes(out);
      assert.equal(ignored.has(out), !exempt, `${out}: ignored=${ignored.has(out)} exempt=${exempt}`);
    }
  });
  it('exemptions are tracked in git', () => {
    for (const exempt of TRACKED_OUTPUT_EXEMPTIONS) {
      assert.ok(tracked.has(exempt), `${exempt} must stay tracked`);
      assert.ok(outputs.includes(exempt), `${exempt} must still be a generator output`);
    }
  });
  it('no generator output remains tracked except exemptions', () => {
    for (const out of outputs) {
      if (TRACKED_OUTPUT_EXEMPTIONS.includes(out)) continue;
      assert.ok(!tracked.has(out), `${out} should be untracked`);
    }
  });
});
