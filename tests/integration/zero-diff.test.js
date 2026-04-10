const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { DRY_RUN_MARKER, parseDryRunReport, runGenerator } = require('./helpers');

describe('zero-diff validation', () => {
  it('generator output matches committed files exactly', () => {
    const report = parseDryRunReport(runGenerator(['--dry-run']));

    assert.equal(report.marker, DRY_RUN_MARKER);
    assert.ok(report.statusLines.length > 0, 'Expected generator to inspect manifest outputs');
    assert.ok(
      report.statusLines.includes('[UNCHANGED] hooks/canonical-source.js'),
      'Expected gemini hook helper to be generated and unchanged'
    );
    assert.ok(
      report.statusLines.includes('[UNCHANGED] mcp/canonical-source.js'),
      'Expected gemini MCP helper to be generated and unchanged'
    );
    assert.ok(
      report.statusLines.includes('[UNCHANGED] claude/mcp/canonical-source.js'),
      'Expected claude MCP helper to be generated and unchanged'
    );
    assert.ok(
      report.statusLines.includes('[UNCHANGED] claude/src/mcp/maestro-server.js'),
      'Expected claude local src payload to be generated and unchanged'
    );
    assert.ok(
      report.statusLines.includes('[UNCHANGED] plugins/maestro/mcp/canonical-source.js'),
      'Expected codex MCP helper to be generated and unchanged'
    );
    assert.ok(
      report.statusLines.includes('[UNCHANGED] plugins/maestro/src/mcp/maestro-server.js'),
      'Expected codex local src payload to be generated and unchanged'
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
