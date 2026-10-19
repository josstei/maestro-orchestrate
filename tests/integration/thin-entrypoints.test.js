'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { ROOT } = require('./helpers');

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

  it('Antigravity plugin config launches the plugin MCP shim', () => {
    const { mcpServers } = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'antigravity/mcp_config.json'), 'utf8')
    );
    assert.deepEqual(mcpServers.maestro.args, ['${PLUGIN_ROOT}/mcp/maestro-server.js']);
    assert.equal(fs.existsSync(path.join(ROOT, 'antigravity/mcp/maestro-server.js')), true);
  });

  it('Antigravity hook shims back every hooks.json command with repo-first / bundled-fallback resolution', () => {
    const hooks = JSON.parse(fs.readFileSync(path.join(ROOT, 'antigravity/hooks.json'), 'utf8'));
    // SessionStart holds handlers directly; PreToolUse groups them under a matcher.
    const commands = Object.values(hooks)
      .flatMap((events) => Object.values(events).flat())
      .flatMap((entry) => (entry.hooks ? entry.hooks : [entry]))
      .map((hook) => hook.command);

    assert.ok(commands.length > 0);
    for (const command of commands) {
      const match = command.match(/^node hooks\/([a-z-]+\.js)( |$)/);
      assert.ok(match, `Expected antigravity hook command to run a plugin hook shim: ${command}`);
      const content = fs.readFileSync(path.join(ROOT, 'antigravity/hooks', match[1]), 'utf8');
      assert.ok(
        content.includes('repoEntry') && content.includes('bundledEntry'),
        `Expected antigravity/hooks/${match[1]} to have repo-first / bundled-fallback resolution`
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

    const { hooks } = JSON.parse(fs.readFileSync(path.join(ROOT, 'qwen/hooks.json'), 'utf8'));
    const commands = Object.values(hooks).flatMap((groups) =>
      groups.flatMap((group) => group.hooks.map((hook) => hook.command))
    );
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

  it('no canonical-source.js helper copies exist (thin entrypoints resolve src/ directly)', () => {
    const forbiddenLocations = [
      'src/core/canonical-source.js',
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

  it('generated platform metadata exists at final locations', () => {
    const requiredFiles = [
      '.agents/plugins/marketplace.json',
      '.claude-plugin/marketplace.json',
      'antigravity/plugin.json',
      'antigravity/mcp_config.json',
      'antigravity/hooks.json',
      'claude/.claude-plugin/plugin.json',
      'claude/.mcp.json',
      'claude/hooks/claude-hooks.json',
      'plugins/maestro/.codex-plugin/plugin.json',
      'plugins/maestro/.mcp.json',
      'qwen-extension.json',
      'qwen/hooks.json',
      'policies/maestro.toml',
    ];

    for (const file of requiredFiles) {
      assert.equal(
        fs.existsSync(path.join(ROOT, file)),
        true,
        `Expected generated platform metadata ${file} to exist`
      );
    }
  });

  it('removed Gemini CLI runtime artifacts are gone', () => {
    // Repo-root agents/ is not listed: it now holds the Qwen agent stubs.
    const removedPaths = [
      'src/platforms/gemini',
      'GEMINI.md',
      'gemini-extension.json',
      '.geminiignore',
      'hooks/hooks.json',
      'docs/runtime-gemini.md',
    ];

    for (const file of removedPaths) {
      assert.equal(
        fs.existsSync(path.join(ROOT, file)),
        false,
        `Expected removed Gemini artifact ${file} to NOT exist`
      );
    }
  });
});
