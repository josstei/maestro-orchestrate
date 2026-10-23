'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { DRY_RUN_MARKER, getGitStatus, parseDryRunReport, runGenerator } = require('./helpers');

describe('zero-diff validation', () => {
  it('generator output matches committed files exactly', () => {
    const beforeStatus = getGitStatus();
    const report = parseDryRunReport(runGenerator(['--dry-run']));

    assert.equal(getGitStatus(), beforeStatus, 'Expected --dry-run to leave the worktree unchanged');
    assert.equal(report.marker, DRY_RUN_MARKER);
    assert.ok(report.statusLines.length > 0, 'Expected generator to inspect manifest outputs');
    const { outputPaths } = report;
    assert.ok(
      outputPaths.includes('agents/architect.md'),
      'Expected qwen agent stubs (repo-root agents/) in generator output'
    );
    assert.deepEqual(
      outputPaths.filter((outputPath) => outputPath.startsWith('qwen/agents/')),
      [],
      'Did not expect qwen agent stubs under qwen/agents/ (Qwen Code never reads it)'
    );
    assert.ok(
      outputPaths.includes('claude/agents/architect.md'),
      'Expected claude agent stubs in generator output'
    );
    assert.ok(
      outputPaths.includes('qwen-extension.json'),
      'Expected platform metadata in generator output'
    );
    for (const qwenOwned of [
      'qwen/hooks.json',
      'policies/maestro.toml',
      'commands/maestro/orchestrate.toml',
      'commands/maestro/review.toml',
      'mcp/maestro-server.js',
      'hooks/hook-runner.js',
    ]) {
      assert.ok(outputPaths.includes(qwenOwned), `Expected ${qwenOwned} in generator output`);
    }
    assert.ok(
      report.statusLines.some((line) => line.includes('plugins/maestro/.mcp.json')),
      'Expected Codex MCP metadata in generator output'
    );
    for (const antigravityOwned of [
      'antigravity/plugin.json',
      'antigravity/mcp_config.json',
      'antigravity/hooks.json',
      'antigravity/agents/architect.md',
      'antigravity/skills/orchestrate/SKILL.md',
      'antigravity/skills/delegation/SKILL.md',
      'antigravity/mcp/maestro-server.js',
      'antigravity/hooks/hook-runner.js',
      'antigravity/hooks/policy-enforcer.js',
    ]) {
      assert.ok(outputPaths.includes(antigravityOwned), `Expected ${antigravityOwned} in generator output`);
    }
    assert.deepEqual(
      outputPaths.filter(
        (outputPath) =>
          outputPath.startsWith('antigravity/') && !outputPath.startsWith('antigravity/src/') &&
          !/^antigravity\/(plugin\.json|mcp_config\.json|hooks\.json|agents\/[a-z0-9-]+\.md|skills\/[a-z0-9-]+\/SKILL\.md|mcp\/maestro-server\.js|hooks\/(hook-runner|policy-enforcer)\.js)$/.test(outputPath)
      ),
      [],
      'Did not expect generated Antigravity outputs beyond metadata, agents, skills and entrypoints'
    );
    assert.ok(
      report.statusLines.every((line) => !line.includes('canonical-source.js')),
      'Did not expect canonical-source copies in generator output'
    );
    for (const entrypoint of [
      'claude/mcp/maestro-server.js',
      'claude/scripts/hook-runner.js',
      'claude/scripts/policy-enforcer.js',
      'bin/maestro-mcp-server.js',
    ]) {
      assert.ok(outputPaths.includes(entrypoint), `Expected ${entrypoint} in generator output`);
    }
    assert.ok(
      outputPaths.every((file) => !/^(?:antigravity|claude|plugins\/maestro)\/lib\//.test(file)),
      'Did not expect mirrored lib outputs in dry-run status'
    );
    assert.deepEqual(
      outputPaths.filter(
        (outputPath) => /gemini/i.test(outputPath) || outputPath === 'hooks/hooks.json'
      ),
      [],
      'Did not expect removed Gemini outputs (gemini-extension.json, GEMINI.md, hooks/hooks.json) in generator output'
    );
    for (const payload of ['antigravity/src', 'claude/src', 'plugins/maestro/src']) {
      assert.ok(outputPaths.includes(`${payload}/mcp/maestro-server.js`));
      assert.ok(outputPaths.includes(`${payload}/scripts/write-state.js`));
    }
    assert.deepEqual(
      report.driftLines,
      [],
      `Generator output drift detected:\n${report.driftLines.join('\n')}`
    );
    assert.deepEqual(report.nonStatusLines, []);
  });
});
