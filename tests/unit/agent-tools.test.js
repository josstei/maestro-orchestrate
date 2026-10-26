'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { mapTools } = require('../../src/core/agent-tools');

const QWEN_UNMAPPED = { name: 'qwen', tools: {} };

describe('mapTools', () => {
  for (const [name, frontmatter, runtimeConfig, expected] of [
    ['maps canonical tool names through runtimeConfig.tools', { tools: ['read_file', 'write_file'] },
      { name: 'qwen', tools: { read_file: 'ReadFile', write_file: 'WriteFile' } }, ['ReadFile', 'WriteFile']],
    ['uses per-runtime tool override when present',
      { tools: ['read_file', 'write_file'], 'tools.claude': ['Read', 'Write'] },
      { name: 'claude', tools: { Read: 'Read', Write: 'Write' } }, ['Read', 'Write']],
    ['maps the per-runtime override through runtimeConfig.tools as well',
      { tools: ['read_file'], 'tools.qwen': ['write_todos'] },
      { name: 'qwen', tools: { write_todos: 'todo_write' } }, ['todo_write']],
    ['flattens array tool mappings',
      { tools: ['bash'] }, { name: 'qwen', tools: { bash: ['Bash', 'Terminal'] } }, ['Bash', 'Terminal']],
    ['drops duplicate mapped names, keeping the first occurrence',
      { tools: ['read_file', 'grep_search', 'read_many_files', 'activate_skill'] },
      {
        name: 'antigravity',
        tools: { read_file: 'view_file', read_many_files: 'view_file', activate_skill: 'view_file' },
      },
      ['view_file', 'grep_search']],
    ['keeps unmapped tool names as-is', { tools: ['custom_tool'] }, QWEN_UNMAPPED, ['custom_tool']],
    ['drops empty entries', { tools: ['a', '', 'b'] }, QWEN_UNMAPPED, ['a', 'b']],
    ['ignores a non-array tools value', { tools: 'a, b' }, QWEN_UNMAPPED, []],
    ['maps no tools when none are declared', {}, QWEN_UNMAPPED, []],
  ]) {
    it(name, () => {
      assert.deepEqual(mapTools(frontmatter, runtimeConfig), expected);
    });
  }

  it('applies the default agent policy after mapping and retains unlisted tools', () => {
    const runtimeConfig = {
      name: 'custom',
      tools: { read: 'Read', read_many: 'Read', todo: ['TaskCreate', 'TaskUpdate'], ask: 'Ask' },
      agentTools: { exclude: ['Ask'], order: ['Read', 'Write', 'TaskCreate', 'TaskUpdate'] },
    };
    assert.deepEqual(
      mapTools({ tools: ['extension_b', 'todo', 'ask', 'read_many', 'read', 'extension_a'] }, runtimeConfig),
      ['Read', 'TaskCreate', 'TaskUpdate', 'extension_b', 'extension_a']
    );
  });

  it('lets explicit overrides retain excluded tools and their original order', () => {
    const runtimeConfig = {
      name: 'custom',
      tools: { read: 'Read', ask: 'Ask' },
      agentTools: { exclude: ['Ask'], order: ['Read', 'Write'] },
    };
    assert.deepEqual(
      mapTools({ tools: ['read'], 'tools.custom': ['ask', 'Write', 'read'] }, runtimeConfig),
      ['Ask', 'Write', 'Read']
    );
    assert.deepEqual(mapTools({ tools: ['read'], 'tools.custom': [] }, runtimeConfig), []);
  });
});
