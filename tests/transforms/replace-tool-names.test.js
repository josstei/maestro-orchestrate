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

  // --- Missing tests ---

  it('should handle runtime with no tools property', () => {
    const content = 'Use `read_file` to load.';
    const runtime = {};
    const result = replaceToolNames(content, runtime);
    assert.equal(result, 'Use `read_file` to load.');
  });

  it('should handle runtime with empty tools object', () => {
    const content = 'Use `read_file` to load.';
    const runtime = { tools: {} };
    const result = replaceToolNames(content, runtime);
    assert.equal(result, 'Use `read_file` to load.');
  });

  it('should replace multiple different tool names in the same content', () => {
    const content = 'Use `read_file` then `write_file` then `glob`.';
    const runtime = { tools: { read_file: 'Read', write_file: 'Write', glob: 'Glob' } };
    const result = replaceToolNames(content, runtime);
    assert.equal(result, 'Use `Read` then `Write` then `Glob`.');
  });

  it('should replace multiple occurrences of the same tool name', () => {
    const content = 'First `read_file` then another `read_file` call.';
    const runtime = { tools: { read_file: 'Read' } };
    const result = replaceToolNames(content, runtime);
    assert.equal(result, 'First `Read` then another `Read` call.');
  });

  it('should not replace tool names that appear without backticks in prose', () => {
    // The backtick replacement only targets `tool_name` forms
    const content = 'The read_file function is powerful.';
    const runtime = { tools: { read_file: 'Read' } };
    const result = replaceToolNames(content, runtime);
    // The bare word "read_file" should remain because it has no backticks
    // AND no YAML list indent pattern
    assert.equal(result, 'The read_file function is powerful.');
  });

  it('should handle tool name that is a substring of another tool name', () => {
    // "glob" vs "glob_search" — ensure backtick wrapping prevents false positives
    const content = 'Use `glob` and `grep_search` here.';
    const runtime = { tools: { glob: 'Glob', grep_search: 'Grep' } };
    const result = replaceToolNames(content, runtime);
    assert.equal(result, 'Use `Glob` and `Grep` here.');
  });

  it('should handle YAML list with single-value mapping', () => {
    const content = 'tools:\n  - read_file\n  - glob';
    const runtime = { tools: { read_file: 'Read', glob: 'Glob' } };
    const result = replaceToolNames(content, runtime);
    assert.ok(result.includes('  - Read'));
    assert.ok(result.includes('  - Glob'));
    assert.ok(!result.includes('  - read_file'));
    assert.ok(!result.includes('  - glob'));
  });

  it('should handle YAML list with extra whitespace variations', () => {
    const content = 'tools:\n    - read_file';
    const runtime = { tools: { read_file: 'Read' } };
    const result = replaceToolNames(content, runtime);
    assert.ok(result.includes('    - Read'));
  });

  it('should preserve YAML list items that are not in the tools map', () => {
    const content = 'tools:\n  - read_file\n  - unknown_tool';
    const runtime = { tools: { read_file: 'Read' } };
    const result = replaceToolNames(content, runtime);
    assert.ok(result.includes('  - Read'));
    assert.ok(result.includes('  - unknown_tool'));
  });

  it('should handle empty content', () => {
    const content = '';
    const runtime = { tools: { read_file: 'Read' } };
    const result = replaceToolNames(content, runtime);
    assert.equal(result, '');
  });

  it('should handle content with no tool references', () => {
    const content = 'This content has no tool references at all.';
    const runtime = { tools: { read_file: 'Read' } };
    const result = replaceToolNames(content, runtime);
    assert.equal(result, 'This content has no tool references at all.');
  });

  it('should handle array expansion in YAML preserving indent from capture group', () => {
    const yamlContent = 'tools:\n  - write_todos';
    const runtime = { tools: { write_todos: ['TaskCreate', 'TaskUpdate'] } };
    const result = replaceToolNames(yamlContent, runtime);
    const lines = result.split('\n');
    // Check that expanded lines are on separate lines with correct indent
    assert.ok(lines.some((l) => l === '  - TaskCreate'));
    assert.ok(lines.some((l) => l === '  - TaskUpdate'));
  });

  it('should handle real-world Claude tool mapping', () => {
    const content = [
      'Use `read_file` to read files, `write_file` to write, `grep_search` to search.',
      'For planning use `write_todos` to manage tasks.',
    ].join('\n');
    const runtime = {
      tools: {
        read_file: 'Read',
        write_file: 'Write',
        grep_search: 'Grep',
        write_todos: ['TaskCreate', 'TaskUpdate', 'TaskList'],
      },
    };
    const result = replaceToolNames(content, runtime);
    assert.ok(result.includes('`Read`'));
    assert.ok(result.includes('`Write`'));
    assert.ok(result.includes('`Grep`'));
    assert.ok(result.includes('`TaskCreate`/`TaskUpdate`/`TaskList`'));
    assert.ok(!result.includes('`read_file`'));
    assert.ok(!result.includes('`write_file`'));
    assert.ok(!result.includes('`grep_search`'));
    assert.ok(!result.includes('`write_todos`'));
  });
});
