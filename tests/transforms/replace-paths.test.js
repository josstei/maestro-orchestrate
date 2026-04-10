const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const replacePaths = require('../../src/transforms/replace-paths');

describe('replace-paths transform', () => {
  it('replaces extensionPath placeholder with runtime-specific env var', () => {
    const content = 'Load from ${extensionPath}/agents/coder.md';
    const runtime = { env: { extensionPath: 'CLAUDE_PLUGIN_ROOT' } };
    const result = replacePaths(content, runtime);
    assert.equal(result, 'Load from ${CLAUDE_PLUGIN_ROOT}/agents/coder.md');
  });

  it('replaces workspacePath placeholder with runtime-specific env var', () => {
    const content = 'State lives at ${workspacePath}/docs/maestro/';
    const runtime = { env: { workspacePath: 'CLAUDE_PROJECT_DIR' } };
    const result = replacePaths(content, runtime);
    assert.equal(result, 'State lives at ${CLAUDE_PROJECT_DIR}/docs/maestro/');
  });

  it('leaves content unchanged when runtime has no env overrides (gemini passthrough)', () => {
    const content = 'Load from ${extensionPath}/agents/coder.md and ${workspacePath}/state/';
    const runtime = { env: {} };
    const result = replacePaths(content, runtime);
    assert.equal(result, 'Load from ${extensionPath}/agents/coder.md and ${workspacePath}/state/');
  });

  // --- Missing tests ---

  it('should replace both extensionPath and workspacePath in the same content', () => {
    const content = 'Load ${extensionPath}/agents and save to ${workspacePath}/state';
    const runtime = { env: { extensionPath: 'CLAUDE_PLUGIN_ROOT', workspacePath: 'CLAUDE_PROJECT_DIR' } };
    const result = replacePaths(content, runtime);
    assert.equal(result, 'Load ${CLAUDE_PLUGIN_ROOT}/agents and save to ${CLAUDE_PROJECT_DIR}/state');
  });

  it('should replace multiple occurrences of the same placeholder', () => {
    const content = '${extensionPath}/a and ${extensionPath}/b';
    const runtime = { env: { extensionPath: 'CLAUDE_PLUGIN_ROOT' } };
    const result = replacePaths(content, runtime);
    assert.equal(result, '${CLAUDE_PLUGIN_ROOT}/a and ${CLAUDE_PLUGIN_ROOT}/b');
  });

  it('should handle runtime with no env property', () => {
    const content = 'Load from ${extensionPath}/agents';
    const runtime = {};
    const result = replacePaths(content, runtime);
    assert.equal(result, 'Load from ${extensionPath}/agents');
  });

  it('should leave content with no placeholders unchanged', () => {
    const content = 'No placeholders here, just plain text.';
    const runtime = { env: { extensionPath: 'CLAUDE_PLUGIN_ROOT' } };
    const result = replacePaths(content, runtime);
    assert.equal(result, 'No placeholders here, just plain text.');
  });

  it('should handle empty content', () => {
    const content = '';
    const runtime = { env: { extensionPath: 'CLAUDE_PLUGIN_ROOT' } };
    const result = replacePaths(content, runtime);
    assert.equal(result, '');
  });

  it('should use the actual gemini runtime env values correctly', () => {
    // Gemini maps extensionPath -> 'extensionPath' (identity) so no replacement visible
    const content = '${extensionPath}/skills/';
    const runtime = { env: { extensionPath: 'extensionPath', workspacePath: 'workspacePath' } };
    const result = replacePaths(content, runtime);
    assert.equal(result, '${extensionPath}/skills/');
  });

  it('should not replace similar-looking but non-matching placeholders', () => {
    const content = '${extensionPathExtra} and $extensionPath and extensionPath';
    const runtime = { env: { extensionPath: 'CLAUDE_PLUGIN_ROOT' } };
    const result = replacePaths(content, runtime);
    // Only ${extensionPath} should match, not ${extensionPathExtra}
    assert.ok(!result.includes('${CLAUDE_PLUGIN_ROOTExtra}'));
    // $extensionPath (no braces) should not be replaced
    assert.ok(result.includes('$extensionPath and extensionPath'));
  });

  it('should handle placeholders in multiline content', () => {
    const content = [
      'path1: ${extensionPath}/agents',
      'path2: ${workspacePath}/state',
      'path3: ${extensionPath}/skills',
    ].join('\n');
    const runtime = { env: { extensionPath: 'CLAUDE_PLUGIN_ROOT', workspacePath: 'CLAUDE_PROJECT_DIR' } };
    const result = replacePaths(content, runtime);
    assert.ok(result.includes('${CLAUDE_PLUGIN_ROOT}/agents'));
    assert.ok(result.includes('${CLAUDE_PROJECT_DIR}/state'));
    assert.ok(result.includes('${CLAUDE_PLUGIN_ROOT}/skills'));
  });

  it('resolves extensionPath relative to the Codex plugin root for nested files', () => {
    const content = 'Load from ${extensionPath}/skills/delegation/protocols/';
    const runtime = {
      name: 'codex',
      outputDir: 'plugins/maestro/',
      env: { extensionPath: '.' },
      relativeExtensionPath: true,
    };
    const result = replacePaths(content, runtime, {
      outputPath: 'plugins/maestro/skills/delegation/SKILL.md',
    });

    assert.equal(result, 'Load from ../../skills/delegation/protocols/');
  });

  it('resolves extensionPath to . for files at the Codex plugin root', () => {
    const content = 'Read ${extensionPath}/skills/';
    const runtime = {
      name: 'codex',
      outputDir: 'plugins/maestro/',
      env: { extensionPath: '.' },
      relativeExtensionPath: true,
    };
    const result = replacePaths(content, runtime, {
      outputPath: 'plugins/maestro/README.md',
    });

    assert.equal(result, 'Read ./skills/');
  });
});
