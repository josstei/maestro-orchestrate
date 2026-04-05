const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const replaceAgentNames = require('../../src/transforms/replace-agent-names');

describe('replace-agent-names transform', () => {
  it('converts kebab-case agent names to snake_case when agentNaming is snake_case', () => {
    const content = 'Delegate to the code-reviewer agent.';
    const runtime = { agentNaming: 'snake_case' };
    const result = replaceAgentNames(content, runtime);
    assert.equal(result, 'Delegate to the code_reviewer agent.');
  });

  it('leaves content unchanged when agentNaming is kebab-case', () => {
    const content = 'Delegate to the code-reviewer agent.';
    const runtime = { agentNaming: 'kebab-case' };
    const result = replaceAgentNames(content, runtime);
    assert.equal(result, 'Delegate to the code-reviewer agent.');
  });

  it('leaves non-agent names alone', () => {
    const content = 'This is a non-agent hyphenated-word and single word.';
    const runtime = { agentNaming: 'snake_case' };
    const result = replaceAgentNames(content, runtime);
    assert.equal(result, 'This is a non-agent hyphenated-word and single word.');
  });

  it('replaces backtick-wrapped agent names', () => {
    const content = 'Use `ux-designer` for this task.';
    const runtime = { agentNaming: 'snake_case' };
    const result = replaceAgentNames(content, runtime);
    assert.equal(result, 'Use `ux_designer` for this task.');
  });
});
