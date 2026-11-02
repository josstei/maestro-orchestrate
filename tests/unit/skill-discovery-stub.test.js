'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { skillDiscoveryStub } = require('../../src/generator/stub-outputs');
const { getRuntimeConfig } = require('../../src/platforms/runtime-config-map');

const SKILL = [
  '---',
  'name: delegation',
  'description: Delegation methodology for agents.',
  'tools: [read_file]',
  '---',
  '',
  'Full methodology content lives here.',
].join('\n');
const stubFor = (frontmatter) => ['---', 'name: delegation', 'description: Delegation methodology for agents.',
  ...frontmatter, '---', '', 'Methodology loaded via MCP. Call `get_skill_content(resources: ["delegation"])`.', ''];

describe('skillDiscoveryStub renderer', () => {
  for (const [runtime, frontmatter] of [
    ['antigravity', ['disable-slash-command: true']],
    ['claude', ['user-invocable: false']],
    ['codex', []],
  ]) {
    it(`renders the ${runtime} stub with its discovery metadata and a get_skill_content body`, () => {
      assert.equal(skillDiscoveryStub(SKILL, getRuntimeConfig(runtime)), stubFor(frontmatter).join('\n'));
    });
  }
});
