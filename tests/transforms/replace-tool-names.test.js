const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const replaceToolNames = require('../../src/transforms/replace-tool-names');

describe('replace-tool-names transform', () => {
  it('replaces a single backtick-wrapped tool name', () => {
    const content = 'Use `write_file` to save the file.';
    const runtime = { tools: { write_file: 'WriteFile' } };
    const result = replaceToolNames(content, runtime);
    assert.equal(result, 'Use `WriteFile` to save the file.');
  });

  it('expands array mappings in both backtick and YAML list forms', () => {
    const backtickContent = 'Call `write_todos` here.';
    const yamlContent = 'tools:\n  - write_todos\n  - other_tool';
    const runtime = { tools: { write_todos: ['TaskCreate', 'TaskUpdate', 'TaskList'] } };

    const backtickResult = replaceToolNames(backtickContent, runtime);
    assert.equal(backtickResult, 'Call `TaskCreate`/`TaskUpdate`/`TaskList` here.');

    const yamlResult = replaceToolNames(yamlContent, runtime);
    assert.ok(yamlResult.includes('  - TaskCreate'));
    assert.ok(yamlResult.includes('  - TaskUpdate'));
    assert.ok(yamlResult.includes('  - TaskList'));
    assert.ok(!yamlResult.includes('  - write_todos'));
  });

  it('passes through identity mappings unchanged', () => {
    const content = 'Use `read_file` to load the file.';
    const runtime = { tools: { read_file: 'read_file' } };
    const result = replaceToolNames(content, runtime);
    assert.equal(result, 'Use `read_file` to load the file.');
  });
});
