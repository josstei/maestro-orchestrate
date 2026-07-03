'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { ROOT } = require('./helpers');
const { assembleClaudePlugin } = require('../../scripts/assemble-claude-plugin');

function withTempOut(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-assemble-'));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('assemble claude plugin (integration)', () => {
  it('produces a self-contained, validatable plugin dir with a sibling src bundle', () => {
    withTempOut((outDir) => {
      const result = assembleClaudePlugin({ root: ROOT, outDir });
      const pluginDir = path.join(outDir, 'claude-plugin');
      assert.equal(result.pluginDir, pluginDir);
      assert.equal(result.bundleDir, path.join(outDir, 'src'));

      const manifestPath = path.join(pluginDir, '.claude-plugin', 'plugin.json');
      assert.equal(fs.existsSync(manifestPath), true);
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      assert.equal(manifest.name, 'maestro');
      assert.equal(manifest.mcpServers, './.mcp.json');
      assert.equal(manifest.hooks, './hooks/claude-hooks.json');

      assert.equal(fs.existsSync(path.join(pluginDir, 'agents', 'code-reviewer.md')), true);
      assert.equal(fs.existsSync(path.join(pluginDir, 'skills', 'orchestrate', 'SKILL.md')), true);
      assert.equal(fs.existsSync(path.join(pluginDir, 'scripts', 'policy-enforcer.js')), true);
      assert.equal(fs.existsSync(path.join(pluginDir, 'mcp', 'maestro-server.js')), true);

      const mcp = JSON.parse(fs.readFileSync(path.join(pluginDir, '.mcp.json'), 'utf8'));
      assert.deepEqual(mcp.mcpServers.maestro.args, ['${CLAUDE_PLUGIN_ROOT}/mcp/maestro-server.js']);

      const hooks = fs.readFileSync(path.join(pluginDir, 'hooks', 'claude-hooks.json'), 'utf8');
      assert.ok(hooks.includes('${CLAUDE_PLUGIN_ROOT}/scripts/hook-runner.js'));
      assert.ok(!hooks.includes('/claude/scripts/'));

      const wrapperResolvedSrc = path.resolve(pluginDir, 'mcp', '..', '..', 'src', 'mcp', 'maestro-server.js');
      assert.equal(wrapperResolvedSrc, path.join(outDir, 'src', 'mcp', 'maestro-server.js'));
      assert.equal(fs.existsSync(wrapperResolvedSrc), true);

      assert.equal(fs.existsSync(path.join(pluginDir, 'claude')), false);
      assert.equal(result.command, `claude --plugin-dir ${pluginDir}`);
    });
  });

  it('is idempotent — re-assembling removes stale promoted files', () => {
    withTempOut((outDir) => {
      assembleClaudePlugin({ root: ROOT, outDir });
      const stale = path.join(outDir, 'claude-plugin', 'agents', 'stale-agent.md');
      fs.writeFileSync(stale, 'stale', 'utf8');
      assembleClaudePlugin({ root: ROOT, outDir });
      assert.equal(fs.existsSync(stale), false);
    });
  });

  it('fails with an actionable message when the generated claude/ tree is missing', () => {
    withTempOut((outDir) => {
      const emptyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-empty-root-'));
      try {
        assert.throws(() => assembleClaudePlugin({ root: emptyRoot, outDir }), /Run 'just generate'/);
      } finally {
        fs.rmSync(emptyRoot, { recursive: true, force: true });
      }
    });
  });
});
