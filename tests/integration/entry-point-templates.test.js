'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { expandCoreCommands, expandEntryPoints } = require('../../src/generator/entry-point-expander');
const entryPointRegistry = require('../../src/entry-points/registry');

/** Host command names each public-skill runtime must remap, and which expansion emits the remap. */
const HOST_NAME_REMAPS = [
  { reserved: 'review', remapped: 'review-code', kind: 'entryPoints' },
  { reserved: 'debug', remapped: 'debug-workflow', kind: 'entryPoints' },
  { reserved: 'resume', remapped: 'resume-session', kind: 'coreCommands' },
];

describe('expandEntryPoints', () => {
  it('produces qwen TOML for each registry entry', () => {
    const results = expandEntryPoints('qwen');
    assert.ok(results.length >= 9, `Expected >= 9 entries, got ${results.length}`);
    const review = results.find((r) => r.outputPath.includes('review'));
    assert.ok(review, 'Should produce review entry');
    assert.ok(review.outputPath === 'commands/maestro/review.toml');
    assert.ok(review.content.startsWith('description = '));
    assert.ok(review.content.includes('prompt = """'));
    for (const { outputPath } of results) {
      assert.match(outputPath, /^commands\/maestro\/[a-z0-9-]+\.toml$/);
    }
  });

  it('qwen TOML commands keep the unremapped registry names (no reserved host names)', () => {
    const outputPaths = [...expandEntryPoints('qwen'), ...expandCoreCommands('qwen')].map(
      (r) => r.outputPath
    );
    for (const { reserved, remapped } of HOST_NAME_REMAPS) {
      assert.ok(
        outputPaths.includes(`commands/maestro/${reserved}.toml`),
        `Expected qwen to emit commands/maestro/${reserved}.toml`
      );
      assert.ok(
        !outputPaths.includes(`commands/maestro/${remapped}.toml`),
        `Did not expect qwen to emit the remapped commands/maestro/${remapped}.toml`
      );
    }
  });

  for (const { runtime, root } of [
    { runtime: 'claude', root: 'claude/skills' },
    { runtime: 'codex', root: 'plugins/maestro/skills' },
  ]) {
    it(`${runtime} public skills remap reserved host command names`, () => {
      const outputs = {
        entryPoints: expandEntryPoints(runtime),
        coreCommands: expandCoreCommands(runtime),
      };
      assert.ok(outputs.entryPoints.length >= 9);
      assert.ok(outputs.coreCommands.length >= 3);
      const publicSkills = [...outputs.entryPoints, ...outputs.coreCommands];

      for (const { reserved, remapped, kind } of HOST_NAME_REMAPS) {
        const skill = outputs[kind].find((r) => r.outputPath === `${root}/${remapped}/SKILL.md`);
        assert.ok(skill, `Expected ${runtime} ${kind} to produce ${root}/${remapped}/SKILL.md`);
        assert.ok(skill.content.includes(`name: ${remapped}`));
        assert.ok(skill.content.includes('get_skill_content'));
        assert.ok(
          !publicSkills.some((r) => r.outputPath === `${root}/${reserved}/SKILL.md`),
          `Expected ${runtime} public skills to avoid reserved name "${reserved}"`
        );
        assert.ok(
          !publicSkills.some((r) => new RegExp(`^name: ${reserved}$`, 'm').test(r.content)),
          `Expected ${runtime} public skill frontmatter to avoid reserved name "${reserved}"`
        );
      }
    });
  }

  it('qwen preamble activates correct skills', () => {
    const results = expandEntryPoints('qwen');
    const review = results.find((r) => r.outputPath.includes('review'));
    assert.ok(review.content.includes('get_skill_content'));
    assert.ok(review.content.includes('delegation'));
    assert.ok(review.content.includes('code-review'));
  });

  it('claude preamble references delegation for agent entries', () => {
    const results = expandEntryPoints('claude');
    const review = results.find((r) => r.outputPath.includes('review'));
    assert.ok(review.content.includes('get_skill_content'));
    assert.ok(review.content.includes('delegation'));
    assert.ok(review.content.includes('## Protocol'));
  });

  it('codex preamble includes agent references for entries with agents', () => {
    const results = expandEntryPoints('codex');
    const review = results.find((r) => r.outputPath.includes('review'));
    assert.ok(review.content.includes('get_agent'));
    assert.ok(review.content.includes('code-reviewer'));
    const debug = results.find((r) => r.outputPath === 'plugins/maestro/skills/debug-workflow/SKILL.md');
    assert.ok(debug.content.includes('get_agent'));
  });

  it('claude skill headings use the registry title when one is set', () => {
    const headings = Object.fromEntries(
      expandEntryPoints('claude').map((r) => [r.outputPath, r.content.match(/^# .*$/m)[0]])
    );
    assert.equal(headings['claude/skills/a11y-audit/SKILL.md'], '# Maestro Accessibility Audit');
    assert.equal(headings['claude/skills/seo-audit/SKILL.md'], '# Maestro SEO Audit');
    assert.equal(headings['claude/skills/review-code/SKILL.md'], '# Maestro Review Code');
  });

  it('entries without agents omit delegation references', () => {
    const claudeResults = expandEntryPoints('claude');
    const status = claudeResults.find((r) => r.outputPath.includes('status'));
    assert.ok(status);
    // Status has no agents, so no delegation protocol block
    assert.ok(!status.content.includes('## Protocol'));
  });

  it('qwen constraints appear in the prompt', () => {
    const results = expandEntryPoints('qwen');
    const review = results.find((r) => r.outputPath.includes('review'));
    assert.ok(review.content.includes('Do not bury findings'));
  });

  it('codex workflow steps are numbered', () => {
    const results = expandEntryPoints('codex');
    const debug = results.find((r) => r.outputPath.includes('debug-workflow'));
    assert.ok(debug.content.includes('1. '));
    assert.ok(debug.content.includes('2. '));
  });

  it('rejects a registry name that resolves to a reserved host command', () => {
    const review = entryPointRegistry.find((entry) => entry.name === 'review');
    const { runtimeNames } = review;
    review.runtimeNames = { codex: 'review-code' };
    try {
      assert.throws(() => expandEntryPoints('claude'), {
        message:
          'Reserved claude host command name "review" conflicts with a built-in — ' +
          'add a runtimeNames entry to the registry to remap it',
      });
    } finally {
      review.runtimeNames = runtimeNames;
    }
  });

  it('rejects unknown runtimes, including the removed gemini runtime', () => {
    for (const runtime of ['nope', 'gemini']) {
      assert.throws(() => expandEntryPoints(runtime), {
        message: `Unknown runtime for entry-point expansion: "${runtime}"`,
      });
      assert.throws(() => expandCoreCommands(runtime), {
        message: `Unknown runtime for core-command expansion: "${runtime}"`,
      });
    }
  });
});

describe('expandCoreCommands for qwen', () => {
  const QWEN_EXTENSION_FALLBACK = '$HOME/.qwen/extensions/maestro';

  it('emits the orchestrate, execute and resume TOML commands at the repo root', () => {
    const results = expandCoreCommands('qwen');
    assert.deepEqual(
      results.map((r) => r.outputPath).sort(),
      [
        'commands/maestro/execute.toml',
        'commands/maestro/orchestrate.toml',
        'commands/maestro/resume.toml',
      ]
    );
    for (const { content } of results) {
      assert.ok(content.startsWith('description = '));
      assert.ok(content.includes('prompt = """'));
    }
  });

  it('carries the Qwen Code runtime preamble and no Gemini wording', () => {
    for (const { outputPath, content } of expandCoreCommands('qwen')) {
      assert.ok(
        content.includes('## Runtime: Qwen Code'),
        `Expected ${outputPath} to carry the Qwen Code runtime preamble`
      );
      assert.ok(content.includes('| Load skill | `skill` with the skill name |'));
      assert.ok(content.includes('Bare tool names with no prefix, like `resolve_settings`'));
      assert.ok(content.includes('`plan_mode_native` is false'));
      assert.ok(content.includes('`ask_user_question` with Approve and Revise options'));
      assert.doesNotMatch(content, /gemini/i, `Did not expect Gemini wording in ${outputPath}`);
    }
  });

  it('injects session state from the Qwen extension dir only into resume', () => {
    const byPath = Object.fromEntries(
      expandCoreCommands('qwen').map((r) => [r.outputPath, r.content])
    );
    const resume = byPath['commands/maestro/resume.toml'];
    assert.ok(resume.includes('<session-state>'));
    assert.ok(
      resume.includes(`\${MAESTRO_EXTENSION_PATH:-${QWEN_EXTENSION_FALLBACK}}`),
      'Expected resume.toml to fall back to the Qwen extension dir'
    );
    assert.match(
      resume,
      /<\/session-state>[\s\S]*## Runtime: Qwen Code/,
      'Expected the session-state block ahead of the runtime preamble'
    );
    for (const name of ['orchestrate', 'execute']) {
      assert.ok(
        !byPath[`commands/maestro/${name}.toml`].includes('<session-state>'),
        `Did not expect session-state injection in ${name}.toml`
      );
    }
  });
});
