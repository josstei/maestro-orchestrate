import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  CONFIRM_FLAG,
  applyRetentionPlan,
  createRetentionPlan,
  parseArgs,
} from '../../dist/src/tooling/local-artifact-retention.js';

function makeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-retention-'));
}

function writeFile(root, relativePath, content = 'x\n', mtimeSeconds = null) {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  if (mtimeSeconds !== null) {
    const mtime = new Date(mtimeSeconds * 1000);
    fs.utimesSync(filePath, mtime, mtime);
  }
  return filePath;
}

function entryByPath(plan, relativePath) {
  return plan.entries.find((entry) => entry.path === relativePath);
}

describe('local artifact retention', () => {
  it('protects the active session and prunes only archives beyond retention', () => {
    const root = makeRoot();
    try {
      writeFile(root, 'docs/maestro/state/active-session.md');
      writeFile(root, 'docs/maestro/state/archive/new.md', 'new\n', 300);
      writeFile(root, 'docs/maestro/state/archive/old.md', 'old\n', 100);
      writeFile(root, 'docs/maestro/plans/archive/new-plan.md', 'new\n', 300);
      writeFile(root, 'docs/maestro/plans/archive/old-plan.md', 'old\n', 100);
      writeFile(root, 'docs/maestro/knowledge/agent-performance.json', '{}\n');

      const plan = createRetentionPlan({
        root,
        includeBuildOutputs: false,
        includeSuperpowers: false,
        maxPlanArchives: 1,
        maxSessionArchives: 1,
      });

      assert.equal(entryByPath(plan, 'docs/maestro/state/active-session.md').action, 'protect');
      assert.equal(entryByPath(plan, 'docs/maestro/state/archive/new.md').action, 'retain');
      assert.equal(entryByPath(plan, 'docs/maestro/state/archive/old.md').action, 'prune');
      assert.equal(entryByPath(plan, 'docs/maestro/plans/archive/new-plan.md').action, 'retain');
      assert.equal(entryByPath(plan, 'docs/maestro/plans/archive/old-plan.md').action, 'prune');
      assert.equal(entryByPath(plan, 'docs/maestro/knowledge/agent-performance.json').action, 'retain');
      assert.equal(plan.summary.prunableFiles, 2);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('classifies ignored Superpowers and generated build byproducts as prune candidates', () => {
    const root = makeRoot();
    try {
      writeFile(root, '.superpowers/sdd/task-report.md');
      writeFile(root, 'docs/superpowers/session.md');
      writeFile(root, 'src/generated/agent-registry.json', '{}\n');
      writeFile(root, 'dist/src/mcp/maestro-server.d.ts', 'export {};\n');
      writeFile(root, 'dist/src/mcp/maestro-server.js.map', '{}\n');
      writeFile(root, 'dist/src/mcp/maestro-server.js', 'export {};\n');

      const plan = createRetentionPlan({ root });

      assert.equal(entryByPath(plan, '.superpowers/sdd/task-report.md').action, 'prune');
      assert.equal(entryByPath(plan, 'docs/superpowers/session.md').action, 'prune');
      assert.equal(entryByPath(plan, 'src/generated/agent-registry.json').action, 'prune');
      assert.equal(entryByPath(plan, 'dist/src/mcp/maestro-server.d.ts').action, 'prune');
      assert.equal(entryByPath(plan, 'dist/src/mcp/maestro-server.js.map').action, 'prune');
      assert.equal(entryByPath(plan, 'dist/src/mcp/maestro-server.js'), undefined);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('requires explicit confirmation before deleting prune candidates', () => {
    const root = makeRoot();
    try {
      const prunePath = 'docs/maestro/state/archive/old.md';
      const protectedPath = 'docs/maestro/state/active-session.md';
      writeFile(root, prunePath, 'old\n', 100);
      writeFile(root, protectedPath, 'active\n', 200);

      const plan = createRetentionPlan({
        root,
        includeBuildOutputs: false,
        includeSuperpowers: false,
        maxSessionArchives: 0,
      });

      assert.deepEqual(applyRetentionPlan(plan), { pruned: [], prunedBytes: 0 });
      assert.equal(fs.existsSync(path.join(root, prunePath)), true);
      assert.throws(
        () => applyRetentionPlan(plan, { apply: true }),
        /Refusing to prune local artifacts/
      );

      const result = applyRetentionPlan(plan, { apply: true, confirm: true });
      assert.deepEqual(result.pruned, [prunePath]);
      assert.equal(fs.existsSync(path.join(root, prunePath)), false);
      assert.equal(fs.existsSync(path.join(root, protectedPath)), true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('parses retention CLI flags', () => {
    assert.deepEqual(
      parseArgs([
        '--apply',
        CONFIRM_FLAG,
        '--json',
        '--max-session-archives',
        '2',
        '--max-plan-archives',
        '3',
        '--no-build-outputs',
        '--no-superpowers',
      ]),
      {
        apply: true,
        confirm: true,
        format: 'json',
        includeBuildOutputs: false,
        includeSuperpowers: false,
        maxPlanArchives: 3,
        maxSessionArchives: 2,
      }
    );
  });
});
