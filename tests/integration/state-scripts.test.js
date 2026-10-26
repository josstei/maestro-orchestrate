'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const { hermeticEnv, withEnv } = require('../support/env');
const { readStateFile, writeStateFile } = require('../../src/scripts/state-access');
const { makeTempDir, writeTree } = require('../support/fs');
const { ROOT } = require('../support/paths');
const { expectExit, runNode } = require('../support/process');
const { DIR_LINK, leaveCommitted } = require('../support/state');

const SCRIPTS_DIR = path.join(ROOT, 'src', 'scripts');
const SETTING = 'MAESTRO_EXECUTION_MODE';

/**
 * Runs `node src/scripts/<script>` in `cwd` with a hermetic environment, so the
 * CLI resolves `cwd` as its project root rather than an enclosing checkout.
 */
function runScript(script, args, { cwd, input = '', env = {} }) {
  return runNode(path.join(SCRIPTS_DIR, script), args, { cwd, env: hermeticEnv(cwd, env), input });
}

function startScript(script, args, { cwd, env = {} }) {
  const child = spawn(process.execPath, [path.join(SCRIPTS_DIR, script), ...args], {
    cwd, env: hermeticEnv(cwd, env), stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
  child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
  const result = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (status) => resolve({ status, stdout, stderr }));
  });
  return { child, result };
}

describe('state scripts', () => {
  let workspace;

  beforeEach(() => {
    workspace = fs.realpathSync(makeTempDir('maestro-state-scripts-'));
  });

  describe('read-setting.js', () => {
    it('exits 1 with a usage error when no setting name is given', () => {
      const result = runScript('read-setting.js', [], { cwd: workspace });
      expectExit(result, { status: 1, stdout: '', stderr: 'ERROR: Usage: read-setting.js <SETTING_NAME>\n' });
    });

    it('prints an environment value with no trailing newline', () => {
      const result = runScript('read-setting.js', [SETTING], {
        cwd: workspace,
        env: { [SETTING]: 'parallel' },
      });
      expectExit(result, { status: 0, stdout: 'parallel' });
    });

    it('falls back to the project .env when the environment has no value', () => {
      fs.writeFileSync(path.join(workspace, '.env'), `${SETTING}=sequential\n`);
      const result = runScript('read-setting.js', [SETTING], { cwd: workspace });
      expectExit(result, { status: 0, stdout: 'sequential' });
    });

    it('prints nothing when the setting is unset', () => {
      const result = runScript('read-setting.js', [SETTING], { cwd: workspace });
      expectExit(result, { status: 0, stdout: '' });
    });
  });

  describe('ensure-workspace.js', () => {
    it('creates the state and plan directories and the state .gitignore', () => {
      const result = runScript('ensure-workspace.js', ['docs/maestro'], { cwd: workspace });
      assert.equal(result.status, 0, result.stderr);

      const base = path.join(workspace, 'docs', 'maestro');
      for (const dir of ['state', 'state/archive', 'plans', 'plans/archive']) {
        assert.ok(fs.statSync(path.join(base, dir)).isDirectory(), `${dir} should exist`);
      }
      assert.equal(
        fs.readFileSync(path.join(base, 'state', '.gitignore'), 'utf8'),
        'active-session.md\narchive/\n.maestro/\n'
      );
    });

    it('exits 1 without creating the referent when the state directory is a dangling symlink', () => {
      const target = path.join(workspace, 'elsewhere');
      fs.mkdirSync(path.join(workspace, 'docs'));
      fs.symlinkSync(target, path.join(workspace, 'docs', 'maestro'), DIR_LINK);

      const result = runScript('ensure-workspace.js', ['docs/maestro'], { cwd: workspace });
      expectExit(result, { status: 1, stderr: 'ERROR: STATE_DIR must not be a symlink\n' });
      assert.equal(fs.existsSync(target), false);
    });
  });

  describe('write-state.js and read-state.js', () => {
    it('round-trips stdin content through a relative state path', () => {
      const content = '# Notes\n\nphase: 2 — café ✓\n';
      const write = runScript('write-state.js', ['docs/maestro/state/notes.md'], {
        cwd: workspace,
        input: content,
      });
      assert.equal(write.status, 0, write.stderr);

      const read = runScript('read-state.js', ['docs/maestro/state/notes.md'], { cwd: workspace });
      assert.equal(read.status, 0, read.stderr);
      assert.equal(read.stdout, content);
    });

    it('exits 1 when stdin is empty', () => {
      const result = runScript('write-state.js', ['docs/maestro/state/notes.md'], { cwd: workspace });
      expectExit(result, { status: 1, stderr: 'ERROR: stdin content is empty\n' });
    });

    it('exits 1 on a path that traverses out of the workspace', () => {
      const result = runScript('write-state.js', ['../x'], { cwd: workspace, input: 'content' });
      expectExit(result, { status: 1, stderr: 'ERROR: Path traversal not allowed\n' });
    });

    it('hashes the raw bytes while preserving the decoded content in digest reads', () => {
      const bytes = Buffer.from([0x23, 0x20, 0x63, 0x61, 0x66, 0xc3, 0xa9, 0xff, 0x0a]);
      writeTree(workspace, 'docs/maestro/state/notes.md', bytes);
      const result = runScript('read-state.js', ['--with-digest', 'docs/maestro/state/notes.md'], { cwd: workspace });
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(JSON.parse(result.stdout), {
        content: bytes.toString('utf8'),
        sha256: createHash('sha256').update(bytes).digest('hex'),
      });
    });

    it('accepts a current digest and refuses a stale replacement without changing the file', () => {
      const statePath = 'docs/maestro/state/notes.md';
      writeTree(workspace, statePath, 'original\n');
      const read = runScript('read-state.js', [statePath, '--with-digest'], { cwd: workspace });
      assert.equal(read.status, 0, read.stderr);
      const { sha256 } = JSON.parse(read.stdout);
      const first = runScript('write-state.js', [statePath, '--expected-sha256', sha256], {
        cwd: workspace, input: 'updated\n',
      });
      assert.equal(first.status, 0, first.stderr);
      const stale = runScript('write-state.js', ['--expected-sha256', sha256, statePath], {
        cwd: workspace, input: 'stale replacement\n',
      });
      assert.equal(stale.status, 1);
      assert.match(stale.stderr, /STATE_CONFLICT/);
      assert.equal(fs.readFileSync(path.join(workspace, statePath), 'utf8'), 'updated\n');
    });

    it('allows only one of two separate processes to replace the same digest', { timeout: 10000 }, async () => {
      const statePath = 'docs/maestro/state/notes.md';
      writeTree(workspace, statePath, 'original');
      const sha256 = createHash('sha256').update('original').digest('hex');
      const writers = ['first process', 'second process'].map((content) => ({
        content,
        ...startScript('write-state.js', [statePath, '--expected-sha256', sha256], { cwd: workspace }),
      }));
      try {
        for (const writer of writers) writer.child.stdin.end(writer.content);
        const results = await Promise.all(writers.map((writer) => writer.result));
        assert.deepEqual(results.map(({ status }) => status).sort(), [0, 1]);
        const winner = results.findIndex(({ status }) => status === 0);
        assert.match(results[1 - winner].stderr, /STATE_CONFLICT/);
        assert.equal(fs.readFileSync(path.join(workspace, statePath), 'utf8'), writers[winner].content);
      } finally {
        for (const writer of writers) if (writer.child.exitCode === null) writer.child.kill();
      }
    });

    it('treats a missing guarded target as a conflict', () => {
      const statePath = 'docs/maestro/state/missing.md';
      const result = runScript('write-state.js', [statePath, '--expected-sha256', 'a'.repeat(64)], {
        cwd: workspace, input: 'replacement',
      });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /STATE_CONFLICT/);
      assert.equal(fs.existsSync(path.join(workspace, statePath)), false);
    });

    it('preserves generic unguarded writes and rejects guarding a path outside the managed root', () => {
      const statePath = 'notes/outside-state.md';
      const first = runScript('write-state.js', [statePath], { cwd: workspace, input: 'original' });
      assert.equal(first.status, 0, first.stderr);
      const read = runScript('read-state.js', [statePath, '--with-digest'], { cwd: workspace });
      const { sha256 } = JSON.parse(read.stdout);
      const guarded = runScript('write-state.js', [statePath, '--expected-sha256', sha256], {
        cwd: workspace, input: 'replacement',
      });
      assert.equal(guarded.status, 1);
      assert.match(guarded.stderr, /within the configured state directory/);
      assert.equal(fs.readFileSync(path.join(workspace, statePath), 'utf8'), 'original');
    });

    it('retains generic filenames beginning with dashes and ignored trailing arguments', () => {
      const write = runScript('write-state.js', ['--notes.md', 'ignored'], { cwd: workspace, input: 'notes' });
      assert.equal(write.status, 0, write.stderr);
      const read = runScript('read-state.js', ['--notes.md', 'ignored'], { cwd: workspace });
      assert.equal(read.status, 0, read.stderr);
      assert.equal(read.stdout, 'notes');
    });

    it('keeps unrelated configuration diagnostics out of generic raw commands', () => {
      fs.writeFileSync(path.join(workspace, '.env'), 'BROKEN="unterminated\n');
      const write = runScript('write-state.js', ['notes/generic.md'], { cwd: workspace, input: 'notes' });
      expectExit(write, { status: 0, stderr: '' });
      const read = runScript('read-state.js', ['notes/generic.md'], { cwd: workspace });
      expectExit(read, { status: 0, stdout: 'notes', stderr: '' });
    });

    it('reports state configuration diagnostics for managed raw commands', () => {
      fs.writeFileSync(path.join(workspace, '.env'), 'BROKEN="unterminated\n');
      const write = runScript('write-state.js', ['docs/maestro/state/notes.md'], { cwd: workspace, input: 'notes' });
      expectExit(write, {
        status: 0,
        stderr: 'env-file-parser: unclosed quote for key "BROKEN", treating accumulated content as value\n',
      });
    });

    it('preserves unrelated generic paths when state directory configuration is invalid', () => {
      const outside = makeTempDir('maestro-cli-invalid-state-');
      for (const stateDir of [outside, 'docs/../managed']) {
        const options = { cwd: workspace, env: { MAESTRO_STATE_DIR: stateDir } };
        const write = runScript('write-state.js', ['notes/generic.md'], { ...options, input: 'generic content' });
        assert.equal(write.status, 0, write.stderr);
        const read = runScript('read-state.js', ['notes/generic.md'], options);
        assert.equal(read.status, 0, read.stderr);
        assert.equal(read.stdout, 'generic content');
      }
    });

    it('preserves generic raw access when an unrelated state root is a proven symlink cycle', () => {
      fs.symlinkSync(path.join(workspace, 'self-loop'), path.join(workspace, 'self-loop'), DIR_LINK);
      fs.symlinkSync(path.join(workspace, 'second-loop'), path.join(workspace, 'first-loop'), DIR_LINK);
      fs.symlinkSync(path.join(workspace, 'first-loop'), path.join(workspace, 'second-loop'), DIR_LINK);
      fs.writeFileSync(path.join(workspace, '.env'), 'BROKEN="unterminated\n');
      for (const stateDir of ['self-loop', 'first-loop', 'self-loop/state', 'first-loop/nested/state', 'docs/../self-loop']) {
        const options = { cwd: workspace, env: { MAESTRO_STATE_DIR: stateDir } };
        const write = runScript('write-state.js', ['ordinary.md'], { ...options, input: stateDir });
        expectExit(write, { status: 0, stderr: '' }, stateDir);
        const read = runScript('read-state.js', ['ordinary.md'], options);
        expectExit(read, { status: 0, stdout: stateDir, stderr: '' }, stateDir);
        const guarded = runScript('write-state.js', ['ordinary.md', '--expected-sha256', createHash('sha256').update(stateDir).digest('hex')], {
          ...options, input: 'must not replace',
        });
        assert.equal(guarded.status, 1);
        assert.match(guarded.stderr, /within the configured state directory/);
        assert.equal(fs.readFileSync(path.join(workspace, 'ordinary.md'), 'utf8'), stateDir);
        const managed = runScript('write-state.js', ['self-loop/state/notes.md'], { ...options, input: 'must not create' });
        assert.equal(managed.status, 1);
      }
    });

    it('does not treat an inaccessible or unresolved noncyclic root as safely outside', async () => {
      const stateRoot = path.join(workspace, 'unresolved');
      fs.mkdirSync(stateRoot);
      writeTree(workspace, 'ordinary.md', 'original');
      const realpath = fs.realpathSync;
      try {
        for (const code of ['EACCES', 'ELOOP']) {
          fs.realpathSync = Object.assign(function (filename) {
            if (path.resolve(filename) === stateRoot) throw Object.assign(new Error('cannot identify state root'), { code });
            return realpath.apply(this, arguments);
          }, { native: realpath.native });
          await withEnv({ MAESTRO_STATE_DIR: 'unresolved' }, async () => {
            await assert.rejects(readStateFile('ordinary.md', workspace), { code });
            await assert.rejects(writeStateFile('ordinary.md', 'replacement', workspace), { code });
          });
          assert.equal(fs.readFileSync(path.join(workspace, 'ordinary.md'), 'utf8'), 'original');
        }
      } finally { fs.realpathSync = realpath; }
    });

    it('keeps an invalid managed root from falling back to uncoordinated access', () => {
      writeTree(workspace, 'managed/notes.md', 'original');
      const options = { cwd: workspace, env: { MAESTRO_STATE_DIR: 'docs/../managed' } };
      const write = runScript('write-state.js', ['managed/notes.md'], { ...options, input: 'replacement' });
      assert.equal(write.status, 1);
      assert.match(write.stderr, /Path traversal not allowed/);
      assert.equal(fs.readFileSync(path.join(workspace, 'managed/notes.md'), 'utf8'), 'original');
    });

    it('uses the configured state root for guarded updates', () => {
      fs.writeFileSync(path.join(workspace, '.env'), 'MAESTRO_STATE_DIR=.maestro\n');
      writeTree(workspace, '.maestro/state/notes.md', 'original');
      const sha256 = createHash('sha256').update('original').digest('hex');
      const result = runScript('write-state.js', ['.maestro/state/notes.md', '--expected-sha256', sha256], {
        cwd: workspace, input: 'updated',
      });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(fs.readFileSync(path.join(workspace, '.maestro/state/notes.md'), 'utf8'), 'updated');
    });

    it('rejects malformed digest flags before changing files', () => {
      const statePath = 'docs/maestro/state/notes.md';
      writeTree(workspace, statePath, 'original');
      for (const digestArgs of [[], ['bad'], ['g'.repeat(64)], ['a'.repeat(63)]]) {
        const result = runScript('write-state.js', [statePath, '--expected-sha256', ...digestArgs], {
          cwd: workspace, input: 'replacement',
        });
        assert.equal(result.status, 1);
        assert.match(result.stderr, /64-character hexadecimal digest/);
      }
      assert.equal(fs.readFileSync(path.join(workspace, statePath), 'utf8'), 'original');
    });

    // Each configuration returns the MAESTRO_STATE_DIR value it sets up.
    for (const [configuration, configure] of [
      ['no state root configured', () => undefined],
      ['a cyclic configured state root', () => {
        fs.symlinkSync(path.join(workspace, 'loop'), path.join(workspace, 'loop'), DIR_LINK);
        return 'loop';
      }],
      ['an external configured state root', () => makeTempDir('maestro-cli-other-state-')],
      ['a different configured state root', () => '.different-state'],
    ]) {
      it(`denies raw access to coordinator metadata and its directory alias with ${configuration}`, () => {
        const privatePath = 'docs/maestro/state/.maestro/private';
        writeTree(workspace, privatePath, 'private metadata');
        fs.symlinkSync(path.join(workspace, 'docs/maestro/state/.maestro'), path.join(workspace, 'metadata-alias'), DIR_LINK);
        const options = { cwd: workspace, env: { MAESTRO_STATE_DIR: configure() } };
        for (const target of [privatePath, 'metadata-alias/private']) {
          const read = runScript('read-state.js', [target], options);
          expectExit(read, { status: 1, stdout: '' }, target);
          const write = runScript('write-state.js', [target], { ...options, input: 'replacement' });
          assert.equal(write.status, 1);
        }
        assert.equal(fs.readFileSync(path.join(workspace, privatePath), 'utf8'), 'private metadata');
      });
    }

    it('recovers an interrupted managed write before returning raw content', async () => {
      const statePath = 'docs/maestro/state/notes.md';
      writeTree(workspace, statePath, 'old content');
      await leaveCommitted(path.join(workspace, 'docs/maestro'), (tx) => tx.writeFile(path.join(workspace, statePath), 'recovered content'));
      const result = runScript('read-state.js', [statePath], { cwd: workspace });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, 'recovered content');
    });

    it('reports recovery without running a new mutation after an interrupted write', async () => {
      const statePath = 'docs/maestro/state/notes.md';
      writeTree(workspace, statePath, 'old content');
      const transaction = await leaveCommitted(path.join(workspace, 'docs/maestro'), (tx) => tx.writeFile(path.join(workspace, statePath), 'recovered content'));
      const result = runScript('write-state.js', [statePath], { cwd: workspace, input: 'new mutation' });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /STATE_RECOVERED/);
      assert.ok(result.stderr.includes(`(transaction: ${transaction.id})`), result.stderr);
      assert.equal(fs.readFileSync(path.join(workspace, statePath), 'utf8'), 'recovered content');
    });
  });

  describe('read-active-session.js', () => {
    it('reports no active session when none exists', () => {
      const result = runScript('read-active-session.js', [], { cwd: workspace });
      expectExit(result, { status: 0, stdout: 'No active session\n' });
    });

    it('prints the active session file when one exists', () => {
      const sessionContent = '---\n{"session_id":"cli-test","status":"in_progress"}\n---\n# Session\n';
      writeTree(workspace, 'docs/maestro/state/active-session.md', sessionContent);

      const result = runScript('read-active-session.js', [], { cwd: workspace });
      expectExit(result, { status: 0, stdout: sessionContent });
    });

    it('recovers before reading the active session', async () => {
      const sessionPath = 'docs/maestro/state/active-session.md';
      writeTree(workspace, sessionPath, 'original session');
      await leaveCommitted(path.join(workspace, 'docs/maestro'), (tx) => tx.writeFile(path.join(workspace, sessionPath), 'recovered session'));
      const result = runScript('read-active-session.js', [], { cwd: workspace });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, 'recovered session');
    });

    it('does not disguise an unreadable recovery journal as an absent session', () => {
      writeTree(workspace, 'docs/maestro/state/active-session.md', 'existing session');
      writeTree(workspace, 'docs/maestro/state/.maestro/current.json', 'invalid journal');
      const result = runScript('read-active-session.js', [], { cwd: workspace });
      expectExit(result, { status: 1, stdout: '' });
      assert.match(result.stderr, /STATE_RECOVERY_REQUIRED/);
    });
  });
});
