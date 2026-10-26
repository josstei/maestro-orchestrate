'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildRuntimeEntrypointOutputs } = require('../../src/generator/runtime-entrypoints');

describe('buildRuntimeEntrypointOutputs', () => {
  it('rejects a launcher kind it cannot render', () => {
    assert.throws(
      () => buildRuntimeEntrypointOutputs({ root: { name: 'root', outputDir: './', launchers: { mcpServr: 'mcp.js' } } }),
      { message: 'Unknown launcher kind for root: "mcpServr"' }
    );
  });
});
