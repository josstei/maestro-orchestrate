'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { declaredTools, mapTools } = require('../../src/core/agent-tools');

describe('mapTools', () => {
  it('maps canonical tool names through runtimeConfig.tools', () => {
    const frontmatter = { tools: ['read_file', 'write_file'] };
    const runtimeConfig = { name: 'qwen', tools: { read_file: 'ReadFile', write_file: 'WriteFile' } };
    const result = mapTools(frontmatter, runtimeConfig);
    assert.deepEqual(result, ['ReadFile', 'WriteFile']);
  });

  it('uses per-runtime tool override when present', () => {
    const frontmatter = {
      tools: ['read_file', 'write_file'],
      'tools.claude': ['Read', 'Write'],
    };
    const runtimeConfig = { name: 'claude', tools: { Read: 'Read', Write: 'Write' } };
    const result = mapTools(frontmatter, runtimeConfig);
    assert.deepEqual(result, ['Read', 'Write']);
  });

  it('maps the per-runtime override through runtimeConfig.tools as well', () => {
    const frontmatter = {
      tools: ['read_file'],
      'tools.qwen': ['write_todos'],
    };
    const runtimeConfig = { name: 'qwen', tools: { write_todos: 'todo_write' } };
    assert.deepEqual(mapTools(frontmatter, runtimeConfig), ['todo_write']);
  });

  it('flattens array tool mappings', () => {
    const frontmatter = { tools: ['bash'] };
    const runtimeConfig = { name: 'qwen', tools: { bash: ['Bash', 'Terminal'] } };
    const result = mapTools(frontmatter, runtimeConfig);
    assert.deepEqual(result, ['Bash', 'Terminal']);
  });

  it('drops duplicate mapped names, keeping the first occurrence', () => {
    const frontmatter = { tools: ['read_file', 'grep_search', 'read_many_files', 'activate_skill'] };
    const runtimeConfig = {
      name: 'antigravity',
      tools: { read_file: 'view_file', read_many_files: 'view_file', activate_skill: 'view_file' },
    };
    assert.deepEqual(mapTools(frontmatter, runtimeConfig), ['view_file', 'grep_search']);
  });

  it('keeps unmapped tool names as-is', () => {
    const frontmatter = { tools: ['custom_tool'] };
    const runtimeConfig = { name: 'qwen', tools: {} };
    const result = mapTools(frontmatter, runtimeConfig);
    assert.deepEqual(result, ['custom_tool']);
  });

  it('drops empty entries and ignores non-array tool values', () => {
    const runtimeConfig = { name: 'qwen', tools: {} };
    assert.deepEqual(mapTools({ tools: ['a', '', 'b'] }, runtimeConfig), ['a', 'b']);
    assert.deepEqual(mapTools({ tools: 'a, b' }, runtimeConfig), []);
    assert.deepEqual(mapTools({}, runtimeConfig), []);
  });
});

describe('declaredTools', () => {
  const frontmatter = { tools: ['read_file', '', 'write_file'], 'tools.claude': ['Read'] };

  it('reads the runtime override when one is declared, else the canonical tools', () => {
    assert.deepEqual(declaredTools(frontmatter, 'claude'), ['Read']);
    assert.deepEqual(declaredTools(frontmatter, 'qwen'), ['read_file', 'write_file']);
  });

  it('reads the canonical tools when no runtime is named', () => {
    assert.deepEqual(declaredTools(frontmatter), ['read_file', 'write_file']);
  });

  it('declares no tools for a missing or non-list value', () => {
    assert.deepEqual(declaredTools({}), []);
    assert.deepEqual(declaredTools({ tools: 'write_file' }), []);
  });
});
