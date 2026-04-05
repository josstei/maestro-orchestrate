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
});
