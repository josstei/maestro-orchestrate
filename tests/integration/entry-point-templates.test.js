const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { expandEntryPoints } = require('../../scripts/generate');

describe('expandEntryPoints', () => {
  it('produces gemini TOML for each registry entry', () => {
    const results = expandEntryPoints('gemini');
    assert.ok(results.length >= 9, `Expected >= 9 entries, got ${results.length}`);
    const review = results.find((r) => r.outputPath.includes('review'));
    assert.ok(review, 'Should produce review entry');
    assert.ok(review.outputPath === 'commands/maestro/review.toml');
    assert.ok(review.content.startsWith('description = '));
    assert.ok(review.content.includes('prompt = """'));
  });

  it('produces claude SKILL.md with frontmatter', () => {
    const results = expandEntryPoints('claude');
    assert.ok(results.length >= 9);
    const debug = results.find((r) => r.outputPath.includes('debug'));
    assert.ok(debug);
    assert.ok(debug.outputPath === 'claude/skills/debug/SKILL.md');
    assert.ok(debug.content.includes('name: debug'));
    assert.ok(debug.content.includes('get_skill_content'));
  });

  it('produces codex SKILL.md with unprefixed skill names', () => {
    const results = expandEntryPoints('codex');
    assert.ok(results.length >= 9);
    const review = results.find((r) => r.outputPath.includes('review'));
    assert.ok(review);
    assert.ok(review.outputPath === 'plugins/maestro/skills/review/SKILL.md');
    assert.ok(review.content.includes('name: review'));
    assert.ok(review.content.includes('get_skill_content'));
  });

  it('gemini skills_block activates correct skills', () => {
    const results = expandEntryPoints('gemini');
    const review = results.find((r) => r.outputPath.includes('review'));
    assert.ok(review.content.includes('get_skill_content'));
    assert.ok(review.content.includes('delegation'));
    assert.ok(review.content.includes('code-review'));
  });

  it('claude protocol_block references delegation for agent entries', () => {
    const results = expandEntryPoints('claude');
    const review = results.find((r) => r.outputPath.includes('review'));
    assert.ok(review.content.includes('get_skill_content'));
    assert.ok(review.content.includes('delegation'));
  });

  it('codex refs_list includes agent references for entries with agents', () => {
    const results = expandEntryPoints('codex');
    const review = results.find((r) => r.outputPath.includes('review'));
    assert.ok(review.content.includes('get_agent'));
    assert.ok(review.content.includes('code-reviewer'));
  });

  it('entries without agents omit delegation references', () => {
    const claudeResults = expandEntryPoints('claude');
    const status = claudeResults.find((r) => r.outputPath.includes('status'));
    assert.ok(status);
    // Status has no agents, so no delegation protocol block
    assert.ok(!status.content.includes('delegation skill'));
  });

  it('gemini constraints appear in the prompt', () => {
    const results = expandEntryPoints('gemini');
    const review = results.find((r) => r.outputPath.includes('review'));
    assert.ok(review.content.includes('Do not bury findings'));
  });

  it('codex workflow steps are numbered', () => {
    const results = expandEntryPoints('codex');
    const debug = results.find((r) => r.outputPath.includes('debug'));
    assert.ok(debug.content.includes('1. '));
    assert.ok(debug.content.includes('2. '));
  });
});
