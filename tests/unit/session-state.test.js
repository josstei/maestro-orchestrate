'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  DEFAULT_STATE_DIR,
  resolveStateDirPath,
  resolveActiveSessionPath,
  parseSessionFile,
  readState,
  writeState,
  ensureWorkspace,
  writeActiveSession,
  readActiveSession,
} = require('../../src/state/session-state');
const { withEnv } = require('../support/env');
const { makeTempDir } = require('../support/fs');

describe('session-state', () => {
  let tmpRoot;

  beforeEach(() => {
    tmpRoot = makeTempDir('maestro-test-');
  });

  it('DEFAULT_STATE_DIR equals docs/maestro', () => {
    assert.equal(DEFAULT_STATE_DIR, 'docs/maestro');
  });

  it('resolveStateDirPath returns the resolved path of an absolute state dir within root', () => {
    const subDir = path.join(tmpRoot, 'sub');
    fs.mkdirSync(subDir);
    const result = withEnv({ MAESTRO_STATE_DIR: subDir }, () => resolveStateDirPath(tmpRoot));
    assert.equal(result, fs.realpathSync(subDir));
  });

  it('resolveStateDirPath rejects absolute state dirs that traverse out of root', () => {
    const traversalPath = path.join(tmpRoot, '..', 'outside');
    assert.throws(
      () => withEnv({ MAESTRO_STATE_DIR: traversalPath }, () => resolveStateDirPath(tmpRoot)),
      /state_dir must be within the project root/
    );
  });

  it('resolveStateDirPath uses MAESTRO_STATE_DIR env when set', () => {
    const result = withEnv({ MAESTRO_STATE_DIR: 'env/state' }, () =>
      resolveStateDirPath(tmpRoot)
    );
    assert.equal(result, path.join(tmpRoot, 'env/state'));
  });

  it('resolveStateDirPath uses DEFAULT_STATE_DIR as final fallback', () => {
    const result = withEnv({ MAESTRO_STATE_DIR: null, MAESTRO_EXTENSION_PATH: null, CLAUDE_PLUGIN_ROOT: null }, () =>
      resolveStateDirPath(tmpRoot)
    );
    assert.equal(result, path.join(tmpRoot, DEFAULT_STATE_DIR));
  });

  it('resolveStateDirPath reads MAESTRO_STATE_DIR from the workspace .env when the env var is unset', () => {
    // initialize_workspace already honors the workspace .env; session tools and
    // hooks must resolve the same directory.
    fs.writeFileSync(path.join(tmpRoot, '.env'), 'MAESTRO_STATE_DIR=.maestro\n');
    const result = withEnv({ MAESTRO_STATE_DIR: null }, () =>
      resolveStateDirPath(tmpRoot)
    );
    assert.equal(result, path.join(tmpRoot, '.maestro'));
  });

  it('resolveStateDirPath prefers the MAESTRO_STATE_DIR env var over the workspace .env', () => {
    fs.writeFileSync(path.join(tmpRoot, '.env'), 'MAESTRO_STATE_DIR=.maestro\n');
    const result = withEnv({ MAESTRO_STATE_DIR: 'env/state' }, () =>
      resolveStateDirPath(tmpRoot)
    );
    assert.equal(result, path.join(tmpRoot, 'env/state'));
  });

  it('resolveActiveSessionPath finds the session under the state dir named in the workspace .env', () => {
    fs.writeFileSync(path.join(tmpRoot, '.env'), 'MAESTRO_STATE_DIR=.maestro\n');
    const result = withEnv({ MAESTRO_STATE_DIR: null }, () => resolveActiveSessionPath(tmpRoot));
    assert.equal(result, path.join(tmpRoot, '.maestro', 'state', 'active-session.md'));
  });

  it('resolveStateDirPath rejects absolute paths outside root', () => {
    const outsideDir = makeTempDir('maestro-abs-outside-');
    assert.throws(
      () => withEnv({ MAESTRO_STATE_DIR: outsideDir }, () => resolveStateDirPath(tmpRoot)),
      /state_dir must be within the project root/
    );
  });

  it('resolveActiveSessionPath returns correct path', () => {
    const result = withEnv({ MAESTRO_STATE_DIR: null }, () => resolveActiveSessionPath(tmpRoot));
    assert.equal(result, path.join(tmpRoot, DEFAULT_STATE_DIR, 'state', 'active-session.md'));
  });

  it('readState reads file content relative to the root', () => {
    const content = 'session content';
    const filePath = path.join(tmpRoot, 'state.md');
    fs.writeFileSync(filePath, content);
    const result = readState(tmpRoot, 'state.md');
    assert.equal(result, content);
  });

  it('readState throws for absolute paths', () => {
    assert.throws(
      () => readState(tmpRoot, '/etc/passwd'),
      /Path must be relative/
    );
  });

  it('readState throws for paths with ..', () => {
    assert.throws(
      () => readState(tmpRoot, 'foo/../bar'),
      /Path traversal not allowed/
    );
  });

  it('writeState writes content relative to the root', () => {
    const content = 'written content';
    writeState(tmpRoot, 'output.md', content);
    const written = fs.readFileSync(path.join(tmpRoot, 'output.md'), 'utf8');
    assert.equal(written, content);
  });

  it('writeState throws for absolute paths', () => {
    assert.throws(
      () => writeState(tmpRoot, '/etc/passwd', 'content'),
      /Path must be relative/
    );
  });

  it('writeState throws for paths with ..', () => {
    assert.throws(
      () => writeState(tmpRoot, 'foo/../bar', 'content'),
      /Path traversal not allowed/
    );
  });

  it('ensureWorkspace creates required directories under the given state dir', () => {
    ensureWorkspace(tmpRoot, 'custom/state');
    const base = path.join(tmpRoot, 'custom', 'state');
    assert.ok(fs.statSync(path.join(base, 'state')).isDirectory());
    assert.ok(fs.statSync(path.join(base, 'state', 'archive')).isDirectory());
    assert.ok(fs.statSync(path.join(base, 'plans')).isDirectory());
    assert.ok(fs.statSync(path.join(base, 'plans', 'archive')).isDirectory());
  });

  it('ensureWorkspace is idempotent and reports whether the state dir already existed', () => {
    assert.equal(ensureWorkspace(tmpRoot, 'workspace'), false);
    assert.equal(ensureWorkspace(tmpRoot, 'workspace'), true);
  });

  it('ensureWorkspace rejects a state dir that escapes the root', () => {
    assert.throws(() => ensureWorkspace(tmpRoot, '../escape'), /Path traversal not allowed/);
    assert.throws(
      () => ensureWorkspace(tmpRoot, makeTempDir('maestro-abs-outside-')),
      /state_dir must be within the project root/
    );
  });

  it('ensureWorkspace creates .gitignore in state/ dir', () => {
    ensureWorkspace(tmpRoot, 'workspace');
    const gitignorePath = path.join(tmpRoot, 'workspace', 'state', '.gitignore');
    const content = fs.readFileSync(gitignorePath, 'utf8');
    assert.equal(content, 'active-session.md\narchive/\n');
  });

  describe('session file format', () => {
    it('writes the state as JSON frontmatter followed by the body', () => {
      const sessionPath = writeActiveSession(tmpRoot, { phase: 'design' }, '## Notes\nSome content');
      assert.equal(sessionPath, path.join(tmpRoot, 'state', 'active-session.md'));
      assert.equal(
        fs.readFileSync(sessionPath, 'utf8'),
        '---\n{\n  "phase": "design"\n}\n---\n## Notes\nSome content'
      );
    });

    it('round-trips state and body through writeActiveSession and readActiveSession', () => {
      const unsetStateDir = { MAESTRO_STATE_DIR: null, MAESTRO_EXTENSION_PATH: null, CLAUDE_PLUGIN_ROOT: null };
      for (const body of ['## Progress\n- Step 1 done\n- Step 2 done', '']) {
        const state = { phase: 'execution', step: 3, nested: { tags: ['refactor', 'core'] } };
        writeActiveSession(path.join(tmpRoot, DEFAULT_STATE_DIR), state, body);
        const session = withEnv(unsetStateDir, () => readActiveSession(tmpRoot));
        assert.deepEqual(session.state, state);
        assert.equal(session.body, body);
      }
    });

    it('parseSessionFile extracts the JSON data and the body after the closing ---', () => {
      assert.deepEqual(parseSessionFile('---\n{"status": "active"}\n---\nbody text'), {
        data: { status: 'active' },
        body: 'body text',
      });
      assert.equal(parseSessionFile('---\n{"id": 1}\n---\n').body, '');
    });

    it('parseSessionFile keeps --- lines inside the body', () => {
      const body = 'Line one\n---\nLine three after dashes';
      const { data, body: parsedBody } = parseSessionFile(`---\n{"key": "value"}\n---\n${body}`);
      assert.deepEqual(data, { key: 'value' });
      assert.equal(parsedBody, body);
    });

    it('parseSessionFile rejects content without frontmatter with the session-state error text', () => {
      assert.throws(
        () => parseSessionFile('no delimiters here'),
        { message: 'No YAML frontmatter found in session state' }
      );
    });
  });
});
