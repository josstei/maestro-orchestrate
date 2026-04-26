'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const { probeGeminiContract } = require('../../src/platforms/gemini/contract-probe');

const FIXTURE_PATH = path.join(
  __dirname,
  '..',
  'fixtures',
  'runtime-contracts',
  'gemini',
  'request-payload.json'
);

describe('probeGeminiContract', () => {
  const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));

  it('extracts the registered tool list', () => {
    const contract = probeGeminiContract(fixture);
    assert.ok(contract.registered_tools.includes('invoke_agent'));
    assert.ok(contract.registered_tools.includes('read_file'));
    assert.ok(contract.registered_tools.includes('mcp_maestro_get_runtime_context'));
  });

  it('reports invoke_agent as the delegation surface', () => {
    const contract = probeGeminiContract(fixture);
    assert.equal(contract.delegation_surface.tool, 'invoke_agent');
    assert.deepEqual(contract.delegation_surface.params.sort(), ['agent_name', 'prompt', 'wait_for_previous']);
  });

  it('reports subagent_registry_fields as exactly [name, description]', () => {
    const contract = probeGeminiContract(fixture);
    assert.deepEqual(contract.subagent_registry_fields.sort(), ['description', 'name']);
  });

  it('reports frontmatter_enforcement as unverified', () => {
    const contract = probeGeminiContract(fixture);
    assert.equal(contract.frontmatter_enforcement, 'unverified');
  });

  it('throws when the fixture lacks a tools block', () => {
    assert.throws(() => probeGeminiContract({ contents: [], systemInstruction: {} }), {
      message: /missing tools/i,
    });
  });

  it('throws NotCapturedYetError for stub fixtures', () => {
    const { NotCapturedYetError } = require('../../src/platforms/gemini/contract-probe');
    assert.throws(() => probeGeminiContract({ stub: true }), NotCapturedYetError);
  });
});
