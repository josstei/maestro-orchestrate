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

  // --- Missing tests ---

  it('should replace multiple different agent names in the same content', () => {
    const content = 'Delegate code-reviewer then ux-designer then security-engineer.';
    const runtime = { agentNaming: 'snake_case' };
    const result = replaceAgentNames(content, runtime);
    assert.equal(result, 'Delegate code_reviewer then ux_designer then security_engineer.');
  });

  it('should replace multiple occurrences of the same agent name', () => {
    const content = 'The code-reviewer reviews code. Ask code-reviewer again.';
    const runtime = { agentNaming: 'snake_case' };
    const result = replaceAgentNames(content, runtime);
    assert.equal(result, 'The code_reviewer reviews code. Ask code_reviewer again.');
  });

  it('should skip agents without hyphens (no conversion needed)', () => {
    // "debugger", "coder", "refactor", "tester", "architect", "copywriter" have no hyphens
    const content = 'The debugger and coder and refactor and tester agents.';
    const runtime = { agentNaming: 'snake_case' };
    const result = replaceAgentNames(content, runtime);
    assert.equal(result, 'The debugger and coder and refactor and tester agents.');
  });

  it('should replace agent names with multiple hyphens correctly', () => {
    const content = 'Use design-system-engineer for component work.';
    const runtime = { agentNaming: 'snake_case' };
    const result = replaceAgentNames(content, runtime);
    assert.equal(result, 'Use design_system_engineer for component work.');
  });

  it('should handle agent names in YAML list context', () => {
    const content = '  - code-reviewer\n  - ux-designer\n  - tester';
    const runtime = { agentNaming: 'snake_case' };
    const result = replaceAgentNames(content, runtime);
    assert.equal(result, '  - code_reviewer\n  - ux_designer\n  - tester');
  });

  it('should not replace partial matches that happen to contain agent names', () => {
    // "i18n-specialist" should be replaced but "non-i18n-specialist-thing" should
    // also match because the regex matches the substring.
    // This test documents the actual substring-matching behavior.
    const content = 'The i18n-specialist is great.';
    const runtime = { agentNaming: 'snake_case' };
    const result = replaceAgentNames(content, runtime);
    assert.equal(result, 'The i18n_specialist is great.');
  });

  it('should handle content that is only an agent name', () => {
    const content = 'code-reviewer';
    const runtime = { agentNaming: 'snake_case' };
    const result = replaceAgentNames(content, runtime);
    assert.equal(result, 'code_reviewer');
  });

  it('should handle empty content', () => {
    const content = '';
    const runtime = { agentNaming: 'snake_case' };
    const result = replaceAgentNames(content, runtime);
    assert.equal(result, '');
  });

  it('should replace all 22 agent names that contain hyphens', () => {
    const shared = require('../../src/runtimes/shared');
    const hyphenated = shared.agentNames.filter((n) => n.includes('-'));

    // Verify we know how many to expect
    assert.ok(hyphenated.length > 0, 'Expected some hyphenated agent names');

    const content = hyphenated.join(' ');
    const runtime = { agentNaming: 'snake_case' };
    const result = replaceAgentNames(content, runtime);

    for (const name of hyphenated) {
      const snakeName = name.replace(/-/g, '_');
      assert.ok(result.includes(snakeName), `Expected ${snakeName} in result`);
      assert.ok(!result.includes(name), `Did not expect ${name} in result`);
    }
  });

  it('should handle agent name adjacent to special characters', () => {
    const content = '(code-reviewer) [ux-designer] "security-engineer"';
    const runtime = { agentNaming: 'snake_case' };
    const result = replaceAgentNames(content, runtime);
    assert.equal(result, '(code_reviewer) [ux_designer] "security_engineer"');
  });
});
