const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { runMcpCoreBuild } = require('./helpers');

describe('mcp core build', () => {
  it('matches the committed generated core artifact exactly', () => {
    const output = runMcpCoreBuild(['--check']).trim();

    assert.equal(output, '[UNCHANGED] src/mcp/maestro-server-core.js');
  });
});
