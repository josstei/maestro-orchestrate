'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { runGenerator } = require('./helpers');
const { ROOT } = require('../support/paths');

const DRY_RUN_MARKER = '(dry-run — no files written)';
const STATUS_LINE = /^\[(CREATE|UPDATE|UNCHANGED|REMOVE)\] /;
const gitStatus = () =>
  execFileSync('git', ['status', '--short', '--untracked-files=all'], { cwd: ROOT, encoding: 'utf8' });

// A sample of each surface the generator owns: stubs, metadata, entrypoints and payloads.
const GENERATOR_OWNED = [
  'agents/architect.md',
  'claude/agents/architect.md',
  'qwen-extension.json',
  'qwen/hooks.json',
  'policies/maestro.toml',
  'commands/maestro/orchestrate.toml',
  'commands/maestro/review.toml',
  'mcp/maestro-server.js',
  'hooks/hook-runner.js',
  'plugins/maestro/.mcp.json',
  'antigravity/plugin.json',
  'antigravity/mcp_config.json',
  'antigravity/hooks.json',
  'antigravity/agents/architect.md',
  'antigravity/skills/orchestrate/SKILL.md',
  'antigravity/skills/delegation/SKILL.md',
  'antigravity/mcp/maestro-server.js',
  'antigravity/hooks/hook-runner.js',
  'antigravity/hooks/policy-enforcer.js',
  'claude/mcp/maestro-server.js',
  'claude/scripts/hook-runner.js',
  'claude/scripts/policy-enforcer.js',
  'bin/maestro-mcp-server.js',
  'antigravity/src/mcp/maestro-server.js',
  'antigravity/src/scripts/write-state.js',
  'claude/src/mcp/maestro-server.js',
  'claude/src/scripts/write-state.js',
  'plugins/maestro/src/mcp/maestro-server.js',
  'plugins/maestro/src/scripts/write-state.js',
];

describe('zero-diff validation', () => {
  it('generator output matches committed files exactly', () => {
    const beforeStatus = gitStatus();
    const lines = runGenerator(['--dry-run']).trimEnd().split('\n').filter(Boolean);

    assert.equal(gitStatus(), beforeStatus, 'Expected --dry-run to leave the worktree unchanged');
    assert.equal(lines.at(-1), DRY_RUN_MARKER);
    const statusLines = lines.filter((line) => STATUS_LINE.test(line));
    // Payload [CREATE] lines end with ` — <inclusion reason>`.
    const outputPaths = statusLines.map((line) => line.replace(STATUS_LINE, '').replace(/ — .*$/, ''));
    for (const owned of GENERATOR_OWNED) {
      assert.ok(outputPaths.includes(owned), `Expected ${owned} in generator output`);
    }
    assert.deepEqual(
      outputPaths.filter(
        (outputPath) =>
          outputPath.startsWith('antigravity/') && !outputPath.startsWith('antigravity/src/') &&
          !/^antigravity\/(plugin\.json|mcp_config\.json|hooks\.json|agents\/[a-z0-9-]+\.md|skills\/[a-z0-9-]+\/SKILL\.md|mcp\/maestro-server\.js|hooks\/(hook-runner|policy-enforcer)\.js)$/.test(outputPath)
      ),
      [],
      'Did not expect generated Antigravity outputs beyond metadata, agents, skills and entrypoints'
    );
    // Qwen Code never reads qwen/agents/; the rest are removed layouts.
    assert.deepEqual(
      outputPaths.filter(
        (outputPath) =>
          /gemini|canonical-source\.js/i.test(outputPath) ||
          /^qwen\/agents\/|^(?:antigravity|claude|plugins\/maestro)\/lib\//.test(outputPath) ||
          outputPath === 'hooks/hooks.json'
      ),
      [],
      'Did not expect qwen/agents/, mirrored lib/, canonical-source or Gemini outputs'
    );
    const driftLines = statusLines.filter((line) => !line.startsWith('[UNCHANGED] '));
    assert.deepEqual(driftLines, [], `Generator output drift detected:\n${driftLines.join('\n')}`);
    assert.deepEqual(lines.filter((line) => line !== DRY_RUN_MARKER && !STATUS_LINE.test(line)), []);
  });
});
