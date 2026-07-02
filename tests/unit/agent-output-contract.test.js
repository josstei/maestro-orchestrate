const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const AGENT_DIR = path.join(REPO_ROOT, 'src', 'agents');

function agentFiles() {
  return fs.readdirSync(AGENT_DIR)
    .filter((file) => file.endsWith('.md'))
    .sort();
}

describe('canonical agent output contract', () => {
  it('keeps the full handoff template in the shared agent base protocol', () => {
    const protocol = fs.readFileSync(
      path.join(
        REPO_ROOT,
        'src',
        'skills',
        'shared',
        'delegation',
        'protocols',
        'agent-base-protocol.md'
      ),
      'utf8'
    );

    assert.match(protocol, /## Task Report/);
    assert.match(protocol, /## Downstream Context/);
    assert.match(protocol, /\*\*Files Created\*\*/);
    assert.match(protocol, /\*\*Key Interfaces Introduced\*\*/);
  });

  it('keeps canonical agents free of the redundant output-contract pointer and the full template', () => {
    const files = agentFiles();
    assert.ok(files.length > 30, 'expected canonical agent catalog');

    for (const file of files) {
      const absolutePath = path.join(AGENT_DIR, file);
      const content = fs.readFileSync(absolutePath, 'utf8');

      assert.doesNotMatch(
        content,
        /^## Output Contract$/m,
        `${file} must not carry the redundant per-agent output-contract pointer; the injected agent-base-protocol owns the handoff contract`
      );
      assert.doesNotMatch(
        content,
        /^## Task Report$/m,
        `${file} must not duplicate the full Task Report template`
      );
      assert.doesNotMatch(
        content,
        /^## Downstream Context$/m,
        `${file} must not duplicate the full Downstream Context template`
      );
    }
  });
});
