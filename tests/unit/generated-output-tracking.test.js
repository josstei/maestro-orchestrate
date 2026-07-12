import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { TRACKED_OUTPUT_EXEMPTIONS } from '../../dist/src/generator/generated-surface-inventory.js';
import { REPO_ROOT } from '../support/paths.js';

const outputs = execFileSync('node', ['dist/src/tooling/generate.js', '--list-outputs'], { cwd: REPO_ROOT, encoding: 'utf8' })
  .trim().split('\n');

function checkIgnored(paths) {
  if (paths.length === 0) {
    return new Set();
  }

  try {
    const stdout = execFileSync('git', ['check-ignore', '--stdin', '--no-index'], {
      cwd: REPO_ROOT,
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
  execFileSync('git', ['ls-files'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim().split('\n')
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
