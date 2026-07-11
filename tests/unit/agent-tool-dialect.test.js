import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import rebuildFrontmatter from '../../dist/src/transforms/rebuild-frontmatter.js';
import gemini from '../../dist/src/platforms/gemini/runtime-config.js';
import qwen from '../../dist/src/platforms/qwen/runtime-config.js';
import { listAgentSources } from '../../dist/src/core/agent-sources.js';
import { repoPath } from '../support/paths.js';

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
  const SRC_DIR = repoPath('src');
  it('no canonical agent declares tools.gemini', () => {
    const sources = listAgentSources(SRC_DIR);
    assert.equal(sources.length, 39, 'expected the canonical agent catalog');
    for (const source of sources) {
      assert.doesNotMatch(source.content, /^tools\.gemini:/m, `${source.relativePath} still declares tools.gemini`);
    }
  });
});
