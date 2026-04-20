const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { ROOT } = require('./helpers');

describe('thin entrypoint design', () => {
  it('each MCP entrypoint sets its own MAESTRO_RUNTIME default', () => {
    const expectations = [
      { file: 'mcp/maestro-server.js', runtime: 'gemini' },
      { file: 'claude/mcp/maestro-server.js', runtime: 'claude' },
      { file: 'bin/maestro-mcp-server.js', runtime: 'codex' },
    ];

    for (const { file, runtime } of expectations) {
      const content = fs.readFileSync(path.join(ROOT, file), 'utf8');
      assert.ok(
        content.includes(`'${runtime}'`),
        `Expected ${file} to default MAESTRO_RUNTIME to '${runtime}'`
      );
    }
  });

  it('Claude entrypoint has repo-first / bundled-fallback resolution', () => {
    const content = fs.readFileSync(path.join(ROOT, 'claude/mcp/maestro-server.js'), 'utf8');
    assert.ok(
      content.includes('repoEntry') && content.includes('bundledEntry'),
      'Expected claude/mcp/maestro-server.js to have repo-first / bundled-fallback resolution'
    );
  });

  it('Gemini entrypoint uses direct repo-local resolution only', () => {
    const content = fs.readFileSync(path.join(ROOT, 'mcp/maestro-server.js'), 'utf8');
    assert.ok(
      !content.includes('bundledEntry'),
      'Expected Gemini entrypoint to NOT have bundled fallback'
    );
    assert.ok(
      content.includes("require('../src/mcp/maestro-server')"),
      'Expected Gemini entrypoint to require directly from src/'
    );
  });

  it('no canonical-source.js copies exist outside src/core/', () => {
    const forbiddenLocations = [
      'hooks/canonical-source.js',
      'mcp/canonical-source.js',
      'claude/scripts/canonical-source.js',
      'claude/mcp/canonical-source.js',
    ];

    for (const file of forbiddenLocations) {
      assert.equal(
        fs.existsSync(path.join(ROOT, file)),
        false,
        `Expected ${file} to NOT exist (replaced by thin entrypoints)`
      );
    }
  });

  it('hand-authored platform metadata exists at final locations', () => {
    const requiredFiles = [
      'claude/.claude-plugin/plugin.json',
      'claude/.mcp.json',
      'claude/hooks/claude-hooks.json',
      'plugins/maestro/.codex-plugin/plugin.json',
      'plugins/maestro/.mcp.json',
      'GEMINI.md',
      'gemini-extension.json',
      'hooks/hooks.json',
    ];

    for (const file of requiredFiles) {
      assert.equal(
        fs.existsSync(path.join(ROOT, file)),
        true,
        `Expected hand-authored ${file} to exist`
      );
    }
  });
});
