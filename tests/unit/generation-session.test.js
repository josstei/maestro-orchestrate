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
  });

  it('marks dry-run and diff sessions as read-only', () => {
    assert.equal(
      createGenerationSession({ rootDir: tempRoot, dryRun: true }).isReadOnlyMode(),
      true
    );
    assert.equal(
      createGenerationSession({ rootDir: tempRoot, diffMode: true }).isReadOnlyMode(),
      true
    );
    assert.equal(
      createGenerationSession({ rootDir: tempRoot }).isReadOnlyMode(),
      false
    );
  });
});
