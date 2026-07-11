import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { writeFixtureFile } from '../support/filesystem.js';

import {
  DRY_RUN_MARKER,
  createTempRepoCopy,
  getGitStatus,
  parseDryRunReport,
  ROOT,
  runGenerator,
} from './helpers.js';

describe('generator integration', () => {
  it('--dry-run reports manifest status without mutating the worktree', () => {
    const beforeStatus = getGitStatus();
    const result = runGenerator(['--dry-run']);
    const afterStatus = getGitStatus();
    const report = parseDryRunReport(result);

    assert.equal(afterStatus, beforeStatus);
    assert.equal(report.marker, DRY_RUN_MARKER);
    assert.ok(report.statusLines.length > 0, 'Expected dry-run to report manifest output status');
    assert.ok(
      report.statusLines.some((line) => line.includes('agents/architect.md')),
      'Expected agent stubs in dry-run report'
    );
    assert.ok(
      report.statusLines.some((line) => line.includes('claude/agents/architect.md')),
      'Expected claude agent stubs in dry-run report'
    );
    assert.ok(
      report.statusLines.every((line) => !line.includes('canonical-source.js')),
      'Did not expect dry-run to include canonical-source copies'
    );
    assert.ok(
      report.statusLines.every((line) => !line.includes('/lib/')),
      'Did not expect dry-run to mention mirrored lib outputs'
    );
    assert.deepEqual(report.nonStatusLines, []);
  });

  it('thin MCP entrypoints resolve canonical src without canonical-source helpers', () => {
    const entrypoints = [
      'mcp/maestro-server.js',
      'claude/mcp/maestro-server.js',
    ];

    for (const relativePath of entrypoints) {
      const content = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

      assert.ok(
        !content.includes("require('./canonical-source')"),
        `Expected ${relativePath} to NOT use canonical-source helper`
      );
      assert.ok(
        content.includes('MAESTRO_RUNTIME'),
        `Expected ${relativePath} to set MAESTRO_RUNTIME`
      );
    }
  });

  it('--dry-run does not rewrite registry files even when registry content would change', () => {
    const repoRoot = createTempRepoCopy('maestro-generator-dry-run-');

    try {
      const registryPath = path.join(repoRoot, 'src/generated/agent-registry.json');
      const before = fs.readFileSync(registryPath, 'utf8');

      writeFixtureFile(
        repoRoot,
        'src/agents/registry-dry-run-test.md',
        '---\nname: registry-dry-run-test\ncapabilities: read_only\n---\nBody\n',
      );

      runGenerator(['--dry-run'], { cwd: repoRoot });

      const after = fs.readFileSync(registryPath, 'utf8');
      assert.equal(after, before);
    } finally {
      fs.rmSync(path.dirname(repoRoot), { recursive: true, force: true });
    }
  });

  it('--diff does not rewrite registry files even when registry content would change', () => {
    const repoRoot = createTempRepoCopy('maestro-generator-diff-');

    try {
      const registryPath = path.join(repoRoot, 'src/generated/agent-registry.json');
      const before = fs.readFileSync(registryPath, 'utf8');

      writeFixtureFile(
        repoRoot,
        'src/agents/registry-diff-test.md',
        '---\nname: registry-diff-test\ncapabilities: read_only\n---\nBody\n',
      );

      runGenerator(['--diff'], { cwd: repoRoot });

      const after = fs.readFileSync(registryPath, 'utf8');
      assert.equal(after, before);
    } finally {
      fs.rmSync(path.dirname(repoRoot), { recursive: true, force: true });
    }
  });

  it('writes all final registry projections from tracked authored source', () => {
    const repoRoot = createTempRepoCopy('maestro-generator-registry-write-');

    try {
      const generatedDir = path.join(repoRoot, 'src/generated');
      fs.rmSync(generatedDir, { recursive: true, force: true });
      writeFixtureFile(
        repoRoot,
        'src/agents/registry-write-test.md',
        [
          '---',
          'name: registry-write-test',
          'description: "Registry projection fixture"',
          'color: blue',
          'focus: "Registry projection fixture"',
          'tools: []',
          'tools.claude: []',
          'max_turns: 1',
          'temperature: 0',
          'timeout_mins: 1',
          'capabilities: read_only',
          '---',
          'Fixture body.',
          '',
        ].join('\n'),
      );

      runGenerator([], { cwd: repoRoot });

      const agentRegistry = JSON.parse(
        fs.readFileSync(path.join(generatedDir, 'agent-registry.json'), 'utf8')
      );
      const resourceRegistry = JSON.parse(
        fs.readFileSync(path.join(generatedDir, 'resource-registry.json'), 'utf8')
      );
      const hookRegistry = JSON.parse(
        fs.readFileSync(path.join(generatedDir, 'hook-registry.json'), 'utf8')
      );
      assert.equal(agentRegistry.some((agent) => agent.name === 'registry-write-test'), true);
      assert.equal(resourceRegistry.delegation, 'skills/shared/delegation/SKILL.md');
      assert.equal(hookRegistry['before-agent'].fn, 'handleBeforeAgent');
    } finally {
      fs.rmSync(path.dirname(repoRoot), { recursive: true, force: true });
    }
  });
});
