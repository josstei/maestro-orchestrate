'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { resolveStateDirPath, activeSessionFile } = require('../../src/state/paths');
const { ensureWorkspace, archiveActiveSession } = require('../../src/state/session-state');
const { archivePlansDocuments } = require('../../src/state/session-documents');
const { withStateMutation } = require('../../src/state/coordinator');
const { readStateFile, writeStateFile } = require('../../src/scripts/state-access');
const { withEnv } = require('../support/env');
const { makeTempDir } = require('../support/fs');

describe('session-state', () => {
  let tmpRoot;

  beforeEach(() => {
    tmpRoot = makeTempDir('maestro-test-');
  });

  it('resolveStateDirPath resolves absolute state dirs only within root', () => {
    const subDir = path.join(tmpRoot, 'sub');
    fs.mkdirSync(subDir);
    assert.equal(resolveStateDirPath(tmpRoot, subDir), fs.realpathSync(subDir));
    for (const outside of [path.join(tmpRoot, '..', 'outside'), makeTempDir('maestro-abs-outside-')]) {
      assert.throws(() => resolveStateDirPath(tmpRoot, outside), /state_dir must be within the project root/);
    }
  });

  it('resolveStateDirPath prefers override, MAESTRO_STATE_DIR, workspace .env, then docs/maestro', () => {
    // initialize_workspace already honors the workspace .env; session tools and
    // hooks must resolve the same directory.
    const resolve = (stateDir, override) => withEnv(
      { MAESTRO_STATE_DIR: stateDir, MAESTRO_EXTENSION_PATH: null, CLAUDE_PLUGIN_ROOT: null },
      () => resolveStateDirPath(tmpRoot, override));
    assert.equal(resolve(null), path.join(tmpRoot, 'docs/maestro'));
    fs.writeFileSync(path.join(tmpRoot, '.env'), 'MAESTRO_STATE_DIR=.maestro\n');
    assert.equal(resolve(null), path.join(tmpRoot, '.maestro'));
    assert.equal(resolve('env/state'), path.join(tmpRoot, 'env/state'));
    assert.equal(resolve('env/state', 'custom/state'), path.join(tmpRoot, 'custom/state'));
    assert.equal(activeSessionFile(resolve(null)), path.join(tmpRoot, '.maestro', 'state', 'active-session.md'));
  });

  it('reads and writes generic workspace files and rejects absolute or traversing paths', async () => {
    await writeStateFile('output.md', 'written content', tmpRoot);
    assert.equal(fs.readFileSync(path.join(tmpRoot, 'output.md'), 'utf8'), 'written content');
    assert.equal(await readStateFile('output.md', tmpRoot), 'written content');
    for (const [file, message] of [
      ['/etc/passwd', /Path must be relative/],
      ['foo/../bar', /Path traversal not allowed/],
    ]) {
      await assert.rejects(readStateFile(file, tmpRoot), message);
      await assert.rejects(writeStateFile(file, 'content', tmpRoot), message);
    }
  });

  it('ensureWorkspace appends the private-state ignore once and preserves user additions', async () => {
    await ensureWorkspace('workspace', tmpRoot);
    const gitignorePath = path.join(tmpRoot, 'workspace', 'state', '.gitignore');
    fs.writeFileSync(gitignorePath, 'active-session.md\r\narchive/\r\n# user rule\r\ncustom/');
    await ensureWorkspace('workspace', tmpRoot);
    await ensureWorkspace('workspace', tmpRoot);
    assert.equal(fs.readFileSync(gitignorePath, 'utf8'), 'active-session.md\r\narchive/\r\n# user rule\r\ncustom/\n.maestro/\n');
  });

  it('creates archive directories missing from an uninitialized workspace as private (0o700)', {
    skip: process.platform === 'win32' && 'Windows does not report POSIX modes',
  }, async () => {
    const base = path.join(tmpRoot, 'workspace');
    fs.mkdirSync(path.join(base, 'state'), { recursive: true });
    fs.writeFileSync(activeSessionFile(base), '---\nsession_id: s1\n---\n');
    const priorUmask = process.umask(0o022);
    try {
      await withStateMutation(base, { operation: 'archive_session' }, (tx) => {
        archiveActiveSession(tx, 's1');
        archivePlansDocuments(tmpRoot, [], tx);
      });
    } finally { process.umask(priorUmask); }
    for (const dir of ['state/archive', 'plans', 'plans/archive']) {
      assert.equal(fs.statSync(path.join(base, dir)).mode & 0o777, 0o700, dir);
    }
  });
});
