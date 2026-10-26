'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const skillDiscoveryStub = require('../../src/transforms/skill-discovery-stub');
const { getRuntimeConfig } = require('../../src/platforms/runtime-config-map');

describe('skill-discovery-stub transform', () => {
  const antigravityRuntime = getRuntimeConfig('antigravity');
  const claudeRuntime = getRuntimeConfig('claude');
  const codexRuntime = getRuntimeConfig('codex');

  const skillContent = [
    '---',
    'name: delegation',
    'description: Delegation methodology for agents.',
    'tools: [read_file]',
    '---',
    '',
    'Full methodology content lives here.',
  ].join('\n');

  it('extracts name and description from frontmatter into the stub', () => {
    const result = skillDiscoveryStub(skillContent, claudeRuntime);

    assert.ok(result.includes('name: delegation'));
    assert.ok(result.includes('description: Delegation methodology for agents.'));
  });

  it('adds user-invocable: false for claude runtime', () => {
    const result = skillDiscoveryStub(skillContent, claudeRuntime);

    assert.ok(result.includes('user-invocable: false'));
  });

  it('does not add user-invocable for codex runtime', () => {
    const result = skillDiscoveryStub(skillContent, codexRuntime);

    assert.ok(!result.includes('user-invocable'));
  });

  it('adds disable-slash-command: true for antigravity runtime only', () => {
    const result = skillDiscoveryStub(skillContent, antigravityRuntime);

    assert.equal(
      result,
      [
        '---',
        'name: delegation',
        'description: Delegation methodology for agents.',
        'disable-slash-command: true',
        '---',
        '',
        'Methodology loaded via MCP. Call `get_skill_content(resources: ["delegation"])`.',
        '',
      ].join('\n')
    );
    for (const runtime of [claudeRuntime, codexRuntime]) {
      assert.ok(!skillDiscoveryStub(skillContent, runtime).includes('disable-slash-command'), runtime.name);
    }
  });

  it('points to get_skill_content in the body', () => {
    const result = skillDiscoveryStub(skillContent, claudeRuntime);

    assert.ok(result.includes('get_skill_content'));
    assert.ok(result.includes('"delegation"'));
  });
});
