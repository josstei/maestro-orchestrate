const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { DRY_RUN_MARKER, parseDryRunReport, runGenerator } = require('./helpers');

describe('zero-diff validation', () => {
  it('generator output matches committed files exactly', () => {
    const report = parseDryRunReport(runGenerator(['--dry-run']));

    assert.equal(report.marker, DRY_RUN_MARKER);
    assert.ok(report.statusLines.length > 0, 'Expected generator to inspect manifest outputs');
    assert.ok(
      report.statusLines.includes('[UNCHANGED] lib/mcp/core/create-server.js'),
      'Expected decomposed lib outputs to be generated and unchanged'
    );
    assert.ok(
      report.statusLines.includes('[UNCHANGED] plugins/maestro/lib/mcp/tool-packs/index.js'),
      'Expected codex lib outputs to be generated and unchanged'
    );
    assert.ok(
      report.statusLines.includes('[UNCHANGED] plugins/maestro/lib/mcp/generated/resource-registry.js'),
      'Expected codex bundled resource registry output to be generated and unchanged'
    );
    assert.ok(
      report.statusLines.includes('[UNCHANGED] plugins/maestro/lib/mcp/generated/agent-registry.js'),
      'Expected codex bundled agent registry output to be generated and unchanged'
    );
    assert.ok(
      report.statusLines.includes('[UNCHANGED] mcp/maestro-server-core.js'),
      'Expected gemini MCP core output to be generated and unchanged'
    );
    assert.ok(
      report.statusLines.includes('[UNCHANGED] claude/mcp/maestro-server-core.js'),
      'Expected claude MCP core output to be generated and unchanged'
    );
    assert.ok(
      report.statusLines.includes('[UNCHANGED] plugins/maestro/mcp/maestro-server-core.js'),
      'Expected codex MCP core output to be generated and unchanged'
    );
    assert.deepEqual(
      report.driftLines,
      [],
      `Generator output drift detected:\n${report.driftLines.join('\n')}`
    );
  });
});
