import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { resolveStateDirPath } from '../../dist/src/state/session-state.js';
import { handleCompactArchive } from '../../dist/src/mcp/handlers/archive-compaction.js';
import { withEnvSync } from '../support/environment.js';
import { makeTempDir } from '../support/filesystem.js';

function archivePath(projectRoot, sessionId) {
  return path.join(
    resolveStateDirPath(projectRoot),
    'state',
    'archive',
    `${sessionId}.md`
  );
}

function writeArchive(projectRoot, sessionId, created) {
  const filePath = archivePath(projectRoot, sessionId);
  const data = {
    session_id: sessionId,
    task: `archive ${sessionId}`,
    created,
    updated: created,
    status: 'completed',
    phases: [],
  };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `---\n${JSON.stringify(data, null, 2)}\n---\n# ${sessionId}\n`);
  return filePath;
}

describe('handleCompactArchive', () => {
  it('prunes the oldest archived session documents beyond retention', (t) => {
    const workspace = makeTempDir(t, 'maestro-compact-');
    writeArchive(workspace, 'oldest', '2026-07-01T00:00:00.000Z');
    writeArchive(workspace, 'older', '2026-07-02T00:00:00.000Z');
    writeArchive(workspace, 'newer', '2026-07-03T00:00:00.000Z');
    writeArchive(workspace, 'newest', '2026-07-04T00:00:00.000Z');

    const result = withEnvSync(
      {
        MAESTRO_ARCHIVE_RETENTION: '2',
        MAESTRO_EXTENSION_PATH: null,
        MAESTRO_STATE_DIR: null,
      },
      () => handleCompactArchive({}, workspace)
    );

    assert.deepEqual(result, {
      pruned: ['oldest', 'older'],
      retained: 2,
    });
    assert.equal(fs.existsSync(archivePath(workspace, 'oldest')), false);
    assert.equal(fs.existsSync(archivePath(workspace, 'older')), false);
    assert.equal(fs.existsSync(archivePath(workspace, 'newer')), true);
    assert.equal(fs.existsSync(archivePath(workspace, 'newest')), true);
  });

  it('leaves archives untouched when retention is unset', (t) => {
    const workspace = makeTempDir(t, 'maestro-compact-');
    writeArchive(workspace, 'first', '2026-07-01T00:00:00.000Z');
    writeArchive(workspace, 'second', '2026-07-02T00:00:00.000Z');

    const result = withEnvSync(
      {
        MAESTRO_ARCHIVE_RETENTION: null,
        MAESTRO_EXTENSION_PATH: null,
        MAESTRO_STATE_DIR: null,
      },
      () => handleCompactArchive({}, workspace)
    );

    assert.deepEqual(result, {
      pruned: [],
      retained: 2,
    });
    assert.equal(fs.existsSync(archivePath(workspace, 'first')), true);
    assert.equal(fs.existsSync(archivePath(workspace, 'second')), true);
  });

  it('preserves durable knowledge and checkpoint state while compacting archives', (t) => {
    const workspace = makeTempDir(t, 'maestro-compact-');
    const basePath = resolveStateDirPath(workspace);
    writeArchive(workspace, 'oldest', '2026-07-01T00:00:00.000Z');
    writeArchive(workspace, 'newest', '2026-07-02T00:00:00.000Z');

    const knowledgePath = path.join(basePath, 'knowledge', 'architecture-memory.json');
    const checkpointPath = path.join(basePath, 'state', 'checkpoints', 'newest', 'phase-1.md');
    fs.mkdirSync(path.dirname(knowledgePath), { recursive: true });
    fs.mkdirSync(path.dirname(checkpointPath), { recursive: true });
    fs.writeFileSync(knowledgePath, '{"preserved":true}\n');
    fs.writeFileSync(checkpointPath, '# checkpoint\n');

    const result = withEnvSync(
      {
        MAESTRO_ARCHIVE_RETENTION: '1',
        MAESTRO_EXTENSION_PATH: null,
        MAESTRO_STATE_DIR: null,
      },
      () => handleCompactArchive({}, workspace)
    );

    assert.deepEqual(result, {
      pruned: ['oldest'],
      retained: 1,
    });
    assert.equal(fs.readFileSync(knowledgePath, 'utf8'), '{"preserved":true}\n');
    assert.equal(fs.readFileSync(checkpointPath, 'utf8'), '# checkpoint\n');
    assert.equal(fs.existsSync(archivePath(workspace, 'newest')), true);
  });
});
