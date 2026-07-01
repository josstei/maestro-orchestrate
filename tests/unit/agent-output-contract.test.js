const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const AGENT_DIR = path.join(REPO_ROOT, 'src', 'agents');
const OUTPUT_POINTER = [
  '## Output Contract',
  '',
  'Follow the shared Agent Base Protocol output handoff contract injected by the orchestrator.',
].join('\n');

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

  it('keeps canonical agents pointed at the shared protocol instead of duplicating it', () => {
    const files = agentFiles();
    assert.ok(files.length > 30, 'expected canonical agent catalog');

    for (const file of files) {
      const absolutePath = path.join(AGENT_DIR, file);
      const content = fs.readFileSync(absolutePath, 'utf8');

      assert.ok(
        content.includes(OUTPUT_POINTER),
        `${file} must point to the shared Agent Base Protocol output contract`
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
