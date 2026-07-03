'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const rebuildFrontmatter = require('../../src/transforms/rebuild-frontmatter');
const gemini = require('../../src/platforms/gemini/runtime-config');
const qwen = require('../../src/platforms/qwen/runtime-config');

const CANONICAL = [
  'read_file', 'list_directory', 'glob', 'grep_search', 'write_file', 'replace',
  'run_shell_command', 'write_todos', 'activate_skill', 'read_many_files', 'ask_user',
];

function emittedTools(runtime) {
  const out = rebuildFrontmatter('', runtime, {
    state: { frontmatter: { name: 'coder', description: 'x', tools: CANONICAL }, body: '', examples: [] },
  });
  const block = out.match(/tools:\n((?:  - .*\n)+)/)[1];
  return block.trim().split('\n').map((line) => line.replace(/^\s*-\s*/, '').trim());
}

describe('agent tool derivation without tools.gemini', () => {
  it('gemini derives its tool list from canonical tools verbatim (identity dialect)', () => {
    assert.deepEqual(emittedTools(gemini), CANONICAL);
  });

  it('qwen mapping through its dialect is unchanged', () => {
    assert.deepEqual(emittedTools(qwen), [
      'read_file', 'list_directory', 'glob', 'grep_search', 'write_file', 'edit',
      'run_shell_command', 'todo_write', 'skill', 'read_many_files', 'ask_user_question',
    ]);
  });
});

describe('tools.gemini duplication is eliminated', () => {
  const AGENT_DIR = path.resolve(__dirname, '../../src/agents');
  it('no canonical agent declares tools.gemini', () => {
    const files = fs.readdirSync(AGENT_DIR).filter((f) => f.endsWith('.md'));
    assert.ok(files.length > 30, 'expected the canonical agent catalog');
    for (const file of files) {
      const content = fs.readFileSync(path.join(AGENT_DIR, file), 'utf8');
      assert.doesNotMatch(content, /^tools\.gemini:/m, `${file} still declares tools.gemini`);
    }
  });
});
