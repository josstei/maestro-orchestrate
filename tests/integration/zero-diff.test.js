const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { DRY_RUN_MARKER, parseDryRunReport, runGenerator } = require('./helpers');

describe('zero-diff validation', () => {
  it('generator output matches committed files exactly', () => {
    const report = parseDryRunReport(runGenerator(['--dry-run']));

    assert.equal(report.marker, DRY_RUN_MARKER);
    assert.ok(report.statusLines.length > 0, 'Expected generator to inspect manifest outputs');
    assert.ok(
      report.statusLines.some((line) => line.includes('agents/architect.md')),
      'Expected gemini agent stubs in generator output'
    );
    assert.ok(
      report.statusLines.some((line) => line.includes('claude/agents/architect.md')),
      'Expected claude agent stubs in generator output'
    );
    assert.ok(
      report.statusLines.some((line) => line.includes('gemini-extension.json')),
      'Expected platform metadata in generator output'
    );
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
      report.driftLines,
      [],
      `Generator output drift detected:\n${report.driftLines.join('\n')}`
    );
  });
});
