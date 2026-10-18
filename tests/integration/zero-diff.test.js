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
    assert.ok(
      report.statusLines.every((line) => !line.includes('canonical-source.js')),
      'Did not expect canonical-source copies in generator output'
    );
    assert.ok(
      report.statusLines.every((line) => !line.includes('hooks/hook-runner.js')),
      'Did not expect generated hook-runner in generator output'
    );
    assert.ok(
      report.statusLines.every((line) => !line.includes('/lib/')),
      'Did not expect mirrored lib outputs in dry-run status'
    );
    assert.deepEqual(
      outputPaths.filter(
        (outputPath) => /gemini/i.test(outputPath) || outputPath === 'hooks/hooks.json'
      ),
      [],
      'Did not expect removed Gemini outputs (gemini-extension.json, GEMINI.md, hooks/hooks.json) in generator output'
    );
    assert.deepEqual(
      report.driftLines,
      [],
      `Generator output drift detected:\n${report.driftLines.join('\n')}`
    );
    assert.deepEqual(report.nonStatusLines, []);
  });
});
