const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { expandManifest } = require('../../scripts/generate');

describe('expandManifest', () => {
  it('expands a glob entry into explicit entries per runtime', () => {
    const rule = {
      glob: 'agents/*.md',
      transforms: ['inject-frontmatter', 'strip-feature'],
      runtimes: ['gemini', 'claude'],
    };
    const runtimes = {
      gemini: { name: 'gemini', outputDir: './', agentNaming: 'snake_case' },
      claude: { name: 'claude', outputDir: 'claude/', agentNaming: 'kebab-case' },
    };
    const srcDir = path.resolve(__dirname, '../../src');
    const entries = expandManifest([rule], runtimes, srcDir);

    assert.ok(entries.length >= 22, `Expected >= 22 entries, got ${entries.length}`);

    const coderEntries = entries.filter((e) => e.src === 'agents/coder.md');
    assert.equal(coderEntries.length, 1, 'coder.md should appear once for this rule');
    assert.equal(coderEntries[0].outputs.gemini, 'agents/coder.md');
    assert.equal(coderEntries[0].outputs.claude, 'claude/agents/coder.md');
    assert.deepEqual(coderEntries[0].transforms, ['inject-frontmatter', 'strip-feature']);
  });

  it('produces separate entries for same source with different transforms', () => {
    const rules = [
      { glob: 'agents/*.md', transforms: ['inject-frontmatter', 'strip-feature'], runtimes: ['gemini', 'claude'] },
      { glob: 'agents/*.md', transforms: ['strip-feature'], runtimes: ['codex'] },
    ];
    const runtimes = {
      gemini: { name: 'gemini', outputDir: './', agentNaming: 'snake_case' },
      claude: { name: 'claude', outputDir: 'claude/', agentNaming: 'kebab-case' },
      codex: { name: 'codex', outputDir: 'plugins/maestro/', agentNaming: 'kebab-case' },
    };
    const srcDir = path.resolve(__dirname, '../../src');
    const entries = expandManifest(rules, runtimes, srcDir);

    const coderEntries = entries.filter((e) => e.src === 'agents/coder.md');
    assert.equal(coderEntries.length, 2, 'coder.md appears in both rules');

    const geminiClaudeEntry = coderEntries.find((e) => e.outputs.gemini);
    assert.deepEqual(geminiClaudeEntry.transforms, ['inject-frontmatter', 'strip-feature']);

    const codexEntry = coderEntries.find((e) => e.outputs.codex);
    assert.deepEqual(codexEntry.transforms, ['strip-feature']);
  });

  it('applies snake_case naming for gemini agent outputs', () => {
    const rule = {
      glob: 'agents/*.md',
      transforms: ['inject-frontmatter'],
      runtimes: ['gemini'],
    };
    const runtimes = {
      gemini: { name: 'gemini', outputDir: './', agentNaming: 'snake_case' },
    };
    const srcDir = path.resolve(__dirname, '../../src');
    const entries = expandManifest([rule], runtimes, srcDir);

    const crEntry = entries.find((e) => e.src === 'agents/code-reviewer.md');
    assert.ok(crEntry, 'code-reviewer.md should be in entries');
    assert.equal(crEntry.outputs.gemini, 'agents/code_reviewer.md');
  });

  it('passes through explicit entries unchanged', () => {
    const entry = {
      src: 'mcp/maestro-server.js',
      transforms: ['strip-feature'],
      outputs: { gemini: 'mcp/maestro-server.js', claude: 'claude/mcp/maestro-server.js' },
    };
    const entries = expandManifest([entry], {}, '/unused');
    assert.equal(entries.length, 1);
    assert.deepEqual(entries[0], entry);
  });

  it('throws on malformed rule missing glob and src', () => {
    assert.throws(
      () => expandManifest([{ transforms: ['copy'], runtimes: ['gemini'] }], {}, '/unused'),
      { message: /needs "glob" or "src"/ }
    );
  });

  it('throws on rule missing runtimes', () => {
    assert.throws(
      () => expandManifest([{ glob: 'agents/*.md', transforms: ['copy'] }], {}, '/unused'),
      { message: /missing "runtimes"/ }
    );
  });

  it('handles outputName override for hook configs', () => {
    const rule = {
      src: 'hooks/hook-configs/gemini.json',
      transforms: ['copy'],
      runtimes: ['gemini'],
      outputName: 'hooks/hooks.json',
    };
    const runtimes = {
      gemini: { name: 'gemini', outputDir: './' },
    };
    const entries = expandManifest([rule], runtimes, '/unused');
    assert.equal(entries[0].outputs.gemini, 'hooks/hooks.json');
  });
});
