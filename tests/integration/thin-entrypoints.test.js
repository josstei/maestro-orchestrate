'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { readJson } = require('../support/fs');
const { hookCommands } = require('../support/generated-files');
const { ROOT } = require('./helpers');

// Paths earlier layouts shipped, grouped by what made each one obsolete.
const REMOVED_PATHS = {
  'thin entrypoints resolve src/ directly': [
    'src/core/canonical-source.js',
    'hooks/canonical-source.js',
    'mcp/canonical-source.js',
    'claude/scripts/canonical-source.js',
    'claude/mcp/canonical-source.js',
  ],
  'Codex uses skills, not agent files': ['plugins/maestro/agents'],
  'runtimes run src/ or its detached payload, not a mirrored lib/': [
    'lib',
    'antigravity/lib',
    'claude/lib',
    'plugins/maestro/lib',
  ],
  'the MCP server runs from src/, not a generated core bundle': [
    'mcp/maestro-server-core.js',
    'antigravity/mcp/maestro-server-core.js',
    'claude/mcp/maestro-server-core.js',
    'plugins/maestro/mcp/maestro-server-core.js',
    'src/mcp/maestro-server-core.js',
    'src/mcp/server-core-entry.js',
  ],
  // Repo-root agents/ is not listed: it now holds the Qwen agent stubs.
  'the Gemini CLI runtime was removed': [
    'src/platforms/gemini',
    'GEMINI.md',
    'gemini-extension.json',
    '.geminiignore',
    'hooks/hooks.json',
    'docs/runtime-gemini.md',
  ],
};

describe('thin entrypoint design', () => {
  it('no MCP entrypoint names a runtime or uses the canonical-source helper', () => {
    // The server identifies its host runtime from the MCP client, so an
    // entrypoint only locates src/.
    for (const file of [
      'mcp/maestro-server.js',
      'claude/mcp/maestro-server.js',
      'bin/maestro-mcp-server.js',
      'antigravity/mcp/maestro-server.js',
    ]) {
      const content = fs.readFileSync(path.join(ROOT, file), 'utf8');
      assert.ok(
        !content.includes('MAESTRO_RUNTIME'),
        `Expected ${file} to leave MAESTRO_RUNTIME to the host`
      );
      assert.ok(
        !content.includes("require('./canonical-source')"),
        `Expected ${file} to NOT use canonical-source helper`
      );
    }
  });

  it('Claude and Antigravity entrypoints have repo-first / bundled-fallback resolution', () => {
    for (const file of ['claude/mcp/maestro-server.js', 'antigravity/mcp/maestro-server.js']) {
      const content = fs.readFileSync(path.join(ROOT, file), 'utf8');
      assert.ok(
        content.includes('repoEntry') && content.includes('bundledEntry'),
        `Expected ${file} to have repo-first / bundled-fallback resolution`
      );
    }
  });

  it('repo-root (Qwen) entrypoint uses direct repo-local resolution only', () => {
    const content = fs.readFileSync(path.join(ROOT, 'mcp/maestro-server.js'), 'utf8');
    assert.ok(
      !content.includes('bundledEntry'),
      'Expected repo-root Qwen entrypoint to NOT have bundled fallback'
    );
    assert.ok(
      content.includes("require('../src/mcp/maestro-server')"),
      'Expected repo-root Qwen entrypoint to require directly from src/'
    );
  });

  it('repo-root hook runner shim backs every qwen hook registration', () => {
    const shim = fs.readFileSync(path.join(ROOT, 'hooks/hook-runner.js'), 'utf8');
    assert.ok(
      shim.includes("require('../src/platforms/shared/hook-runner')"),
      'Expected hooks/hook-runner.js to require the shared hook runner directly from src/'
    );

    const commands = hookCommands(readJson(path.join(ROOT, 'qwen/hooks.json')));
    const hookNames = commands.map((command) => {
      const match = command.match(/^node \$\{extensionPath\}\/hooks\/hook-runner\.js qwen ([a-z-]+)$/);
      assert.ok(match, `Expected qwen hook command to run the repo-root shim: ${command}`);
      return match[1];
    });
    assert.deepEqual(
      hookNames.sort(),
      Object.keys(require('../../src/generated/hook-registry.json')).sort()
    );
  });

  it('removed runtime artifacts stay gone', () => {
    for (const [reason, removedPaths] of Object.entries(REMOVED_PATHS)) {
      for (const file of removedPaths) {
        assert.equal(fs.existsSync(path.join(ROOT, file)), false, `Expected ${file} to NOT exist: ${reason}`);
      }
    }
  });
});
