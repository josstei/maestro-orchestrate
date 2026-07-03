'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { expandEntryPoints } = require('../../scripts/generate');

describe('insights entry point', () => {
  it('is generated for gemini, claude, and codex and references get_cost_insights', () => {
    const gemini = expandEntryPoints('gemini').find(
      (r) => r.outputPath === 'commands/maestro/insights.toml'
    );
    assert.ok(gemini, 'gemini insights command missing');
    assert.ok(gemini.content.includes('get_cost_insights'));

    const claude = expandEntryPoints('claude').find(
      (r) => r.outputPath === 'claude/skills/insights/SKILL.md'
    );
    assert.ok(claude, 'claude insights skill missing');
    assert.ok(claude.content.includes('name: insights'));
    assert.ok(claude.content.includes('get_cost_insights'));

    const codex = expandEntryPoints('codex').find(
      (r) => r.outputPath === 'plugins/maestro/skills/insights/SKILL.md'
    );
    assert.ok(codex, 'codex insights skill missing');
    assert.ok(codex.content.includes('get_cost_insights'));
  });
});
