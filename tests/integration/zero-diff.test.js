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
    ]) {
      assert.ok(outputPaths.includes(antigravityOwned), `Expected ${antigravityOwned} in generator output`);
    }
    assert.deepEqual(
      outputPaths.filter(
        (outputPath) =>
          outputPath.startsWith('antigravity/') &&
          !/^antigravity\/(plugin\.json|mcp_config\.json|hooks\.json|agents\/[a-z0-9-]+\.md|skills\/[a-z0-9-]+\/SKILL\.md)$/.test(outputPath)
      ),
      [],
      'Did not expect generated Antigravity outputs beyond the metadata, agents/ and skills/ (README.md and the shims are hand-maintained)'
    );
    assert.deepEqual(
      report.driftLines,
      [],
      `Generator output drift detected:\n${report.driftLines.join('\n')}`
    );
    assert.deepEqual(report.nonStatusLines, []);
  });
});
