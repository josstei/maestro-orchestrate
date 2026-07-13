import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createGenerationSession } from '../../dist/src/generator/generation-session.js';

function createTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-generation-session-'));
}

describe('generation session', () => {
  let tempRoot;

  beforeEach(() => {
    tempRoot = createTempRoot();
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('aggregates processing errors with writer errors', () => {
    const session = createGenerationSession({ rootDir: tempRoot });

    session.write('../../../etc/passwd', 'malicious');
    session.reportError('Source not found: missing.md');

    const stats = session.getStats();
    assert.equal(stats.errors, 2);
    assert.equal(stats.write_errors, 1);
    assert.deepEqual(stats.processing_errors, ['Source not found: missing.md']);
    assert.deepEqual(session.getPlannedPaths(), ['../../../etc/passwd']);
  });

  it('provides the complete deduplicated reconciliation plan from all writes', () => {
    const session = createGenerationSession({ rootDir: tempRoot });

    assert.deepEqual(session.getPlannedPaths(), []);
    session.write('agents/a.md', 'a');
    session.writeAll([
      { outputPath: 'commands/b.toml', content: 'b' },
      { outputPath: 'agents/a.md', content: 'a2' },
    ]);
    session.writeAll([]);

    const returnedPaths = session.getPlannedPaths();
    assert.deepEqual(returnedPaths, ['agents/a.md', 'commands/b.toml', 'agents/a.md']);
    assert.deepEqual([...new Set(returnedPaths)], ['agents/a.md', 'commands/b.toml']);
    returnedPaths.push('mutated.md');
    assert.equal(session.getPlannedPaths().includes('mutated.md'), false);
    assert.equal(fs.readFileSync(path.join(tempRoot, 'agents/a.md'), 'utf8'), 'a2');
  });

  it('marks dry-run and diff sessions as read-only', () => {
    const dryRunSession = createGenerationSession({ rootDir: tempRoot, dryRun: true });
    const diffSession = createGenerationSession({ rootDir: tempRoot, diffMode: true });

    dryRunSession.write('dry-run.md', 'dry run');
    diffSession.write('diff.md', 'diff');

    assert.equal(dryRunSession.isReadOnlyMode(), true);
    assert.equal(diffSession.isReadOnlyMode(), true);
    assert.deepEqual(dryRunSession.getPlannedPaths(), ['dry-run.md']);
    assert.deepEqual(diffSession.getPlannedPaths(), ['diff.md']);
    assert.equal(fs.existsSync(path.join(tempRoot, 'dry-run.md')), false);
    assert.equal(fs.existsSync(path.join(tempRoot, 'diff.md')), false);
    assert.equal(
      createGenerationSession({ rootDir: tempRoot }).isReadOnlyMode(),
      false
    );
  });
});
