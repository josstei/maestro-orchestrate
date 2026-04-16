const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { expandCoreCommands, expandEntryPoints } = require('../../scripts/generate');

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
    const debug = results.find((r) => r.outputPath === 'claude/skills/debug-workflow/SKILL.md');
    assert.ok(debug);
    assert.ok(debug.content.includes('name: debug-workflow'));
    assert.ok(debug.content.includes('get_skill_content'));
  });

  it('produces codex SKILL.md with a non-conflicting review skill name', () => {
    const results = expandEntryPoints('codex');
    assert.ok(results.length >= 9);
    const review = results.find((r) => r.outputPath === 'plugins/maestro/skills/review-code/SKILL.md');
    assert.ok(review);
    assert.ok(!results.some((r) => r.outputPath === 'plugins/maestro/skills/review/SKILL.md'));
    assert.ok(review.content.includes('name: review-code'));
    assert.ok(review.content.includes('get_skill_content'));
  });

  it('produces codex SKILL.md with a non-conflicting debug skill name', () => {
    const results = expandEntryPoints('codex');
    assert.ok(results.length >= 9);
    const debug = results.find((r) => r.outputPath === 'plugins/maestro/skills/debug-workflow/SKILL.md');
    assert.ok(debug);
    assert.ok(!results.some((r) => r.outputPath === 'plugins/maestro/skills/debug/SKILL.md'));
    assert.ok(debug.content.includes('name: debug-workflow'));
    assert.ok(debug.content.includes('get_agent'));
  });

  it('produces codex core SKILL.md with a non-conflicting resume skill name', () => {
    const results = expandCoreCommands('codex');
    assert.ok(results.length >= 3);
    const resume = results.find((r) => r.outputPath === 'plugins/maestro/skills/resume-session/SKILL.md');
    assert.ok(resume);
    assert.ok(!results.some((r) => r.outputPath === 'plugins/maestro/skills/resume/SKILL.md'));
    assert.ok(resume.content.includes('name: resume-session'));
    assert.ok(resume.content.includes('get_skill_content'));
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
    const debug = results.find((r) => r.outputPath.includes('debug-workflow'));
    assert.ok(debug.content.includes('1. '));
    assert.ok(debug.content.includes('2. '));
  });

  it('produces claude SKILL.md with a non-conflicting review skill name', () => {
    const results = expandEntryPoints('claude');
    assert.ok(results.length >= 9);
    const review = results.find((r) => r.outputPath === 'claude/skills/review-code/SKILL.md');
    assert.ok(review);
    assert.ok(!results.some((r) => r.outputPath === 'claude/skills/review/SKILL.md'));
    assert.ok(review.content.includes('name: review-code'));
    assert.ok(review.content.includes('get_skill_content'));
  });

  it('produces claude SKILL.md with a non-conflicting debug skill name', () => {
    const results = expandEntryPoints('claude');
    assert.ok(results.length >= 9);
    const debug = results.find((r) => r.outputPath === 'claude/skills/debug-workflow/SKILL.md');
    assert.ok(debug);
    assert.ok(!results.some((r) => r.outputPath === 'claude/skills/debug/SKILL.md'));
    assert.ok(debug.content.includes('name: debug-workflow'));
    assert.ok(debug.content.includes('get_skill_content'));
  });

  it('produces claude core SKILL.md with a non-conflicting resume skill name', () => {
    const results = expandCoreCommands('claude');
    assert.ok(results.length >= 3);
    const resume = results.find((r) => r.outputPath === 'claude/skills/resume-session/SKILL.md');
    assert.ok(resume);
    assert.ok(!results.some((r) => r.outputPath === 'claude/skills/resume/SKILL.md'));
    assert.ok(resume.content.includes('name: resume-session'));
    assert.ok(resume.content.includes('get_skill_content'));
  });

  it('claude public skills avoid reserved host command names', () => {
    const publicSkills = [
      ...expandEntryPoints('claude'),
      ...expandCoreCommands('claude'),
    ];
    const reserved = ['review', 'debug', 'resume'];

    for (const name of reserved) {
      assert.ok(
        !publicSkills.some((skill) => skill.outputPath === `claude/skills/${name}/SKILL.md`),
        `Expected claude public skills to avoid reserved name "${name}"`
      );
      assert.ok(
        !publicSkills.some((skill) => new RegExp(`^name: ${name}$`, 'm').test(skill.content)),
        `Expected claude public skill frontmatter to avoid reserved name "${name}"`
      );
    }
  });

  it('codex public skills avoid reserved host command names', () => {
    const publicSkills = [
      ...expandEntryPoints('codex'),
      ...expandCoreCommands('codex'),
    ];
    const reserved = ['review', 'debug', 'resume'];

    for (const name of reserved) {
      assert.ok(
        !publicSkills.some((skill) => skill.outputPath === `plugins/maestro/skills/${name}/SKILL.md`),
        `Expected codex public skills to avoid reserved name "${name}"`
      );
      assert.ok(
        !publicSkills.some((skill) => new RegExp(`^name: ${name}$`, 'm').test(skill.content)),
        `Expected codex public skill frontmatter to avoid reserved name "${name}"`
      );
    }
  });
});
