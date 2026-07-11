import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { repoPath } from '../support/paths.js';

function read(relPath) {
  return fs.readFileSync(repoPath(relPath), 'utf8');
}

describe('local Claude plugin dev-load docs', () => {
  it('the root README points at the one-step recipe and drops the broken invocations', () => {
    const readme = read('README.md');
    assert.ok(readme.includes('just dev-load-claude'), 'README must document just dev-load-claude');
    assert.ok(
      !readme.includes('--plugin-dir /path/to/maestro-orchestrate/claude'),
      'README must not instruct the zero-tools --plugin-dir .../claude command'
    );
  });

  it('the claude readme template references the recipe', () => {
    assert.ok(read('src/platforms/claude/readme-template.md').includes('dev-load-claude'));
  });

  it('the claude runtime doc references the recipe and drops the .../claude dev command', () => {
    const doc = read('src/platforms/claude/runtime-doc.md');
    assert.ok(doc.includes('dev-load-claude'));
    assert.ok(!doc.includes('--plugin-dir /path/to/maestro-orchestrate/claude'));
  });

  it('package.json exposes the dev-load-claude alias', () => {
    const pkg = JSON.parse(read('package.json'));
    assert.equal(typeof pkg.scripts['dev-load-claude'], 'string');
    assert.ok(pkg.scripts['dev-load-claude'].includes('assemble-claude-plugin.js'));
  });
});
