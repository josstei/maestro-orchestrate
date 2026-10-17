'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { ROOT } = require('./helpers');

const SCRIPTS_DIR = path.join(ROOT, 'src', 'scripts');
const SETTING = 'MAESTRO_EXECUTION_MODE';

// Workspace and setting resolution consult these before cwd, and `npm test`
// (or the host session) may point them at the repo checkout.
const SCRUBBED_ENV = [
  'MAESTRO_WORKSPACE_PATH',
  'CLAUDE_PROJECT_DIR',
  'INIT_CWD',
  'MAESTRO_STATE_DIR',
  'MAESTRO_EXTENSION_PATH',
  'CLAUDE_PLUGIN_ROOT',
  SETTING,
];

function makeTempWorkspace() {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-state-scripts-')));
}

/**
 * Runs `node src/scripts/<script>` in `cwd` with a scrubbed environment, so the
 * CLI resolves `cwd` as its project root rather than an enclosing checkout.
 */
function runScript(script, args, { cwd, input = '', env = {} }) {
  const childEnv = { ...process.env };
  for (const key of SCRUBBED_ENV) delete childEnv[key];
  Object.assign(childEnv, {
    PWD: cwd,
    GIT_CEILING_DIRECTORIES: fs.realpathSync(os.tmpdir()),
    ...env,
  });
  return spawnSync(process.execPath, [path.join(SCRIPTS_DIR, script), ...args], {
    cwd,
    env: childEnv,
    input,
    encoding: 'utf8',
  });
}

describe('state scripts', () => {
  let workspace;

  beforeEach(() => {
    workspace = makeTempWorkspace();
  });

  afterEach(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  describe('read-setting.js', () => {
    it('exits 1 with a usage error when no setting name is given', () => {
      const result = runScript('read-setting.js', [], { cwd: workspace });
      assert.equal(result.status, 1);
      assert.equal(result.stdout, '');
      assert.equal(result.stderr, 'ERROR: Usage: read-setting.js <SETTING_NAME>\n');
    });

    it('prints an environment value with no trailing newline', () => {
      const result = runScript('read-setting.js', [SETTING], {
        cwd: workspace,
        env: { [SETTING]: 'parallel' },
      });
      assert.equal(result.status, 0);
      assert.equal(result.stdout, 'parallel');
    });

    it('falls back to the project .env when the environment has no value', () => {
      fs.writeFileSync(path.join(workspace, '.env'), `${SETTING}=sequential\n`);
      const result = runScript('read-setting.js', [SETTING], { cwd: workspace });
      assert.equal(result.status, 0);
      assert.equal(result.stdout, 'sequential');
    });

    it('prints nothing when the setting is unset', () => {
      const result = runScript('read-setting.js', [SETTING], { cwd: workspace });
      assert.equal(result.status, 0);
      assert.equal(result.stdout, '');
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
        'active-session.md\narchive/\n'
      );
    });

    it('exits 1 when the state directory is a symlink', () => {
      const target = path.join(workspace, 'elsewhere');
      fs.mkdirSync(target);
      fs.mkdirSync(path.join(workspace, 'docs'));
      fs.symlinkSync(target, path.join(workspace, 'docs', 'maestro'), 'dir');

      const result = runScript('ensure-workspace.js', ['docs/maestro'], { cwd: workspace });
      assert.equal(result.status, 1);
      assert.equal(result.stderr, 'ERROR: STATE_DIR must not be a symlink\n');
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
      assert.equal(result.status, 1);
      assert.equal(result.stderr, 'ERROR: stdin content is empty\n');
    });

    it('exits 1 on a path that traverses out of the workspace', () => {
      const result = runScript('write-state.js', ['../x'], { cwd: workspace, input: 'content' });
      assert.equal(result.status, 1);
      assert.equal(result.stderr, 'ERROR: Path traversal not allowed\n');
    });
  });

  describe('read-active-session.js', () => {
    it('reports no active session when none exists', () => {
      const result = runScript('read-active-session.js', [], { cwd: workspace });
      assert.equal(result.status, 0);
      assert.equal(result.stdout, 'No active session\n');
    });

    it('prints the active session file when one exists', () => {
      const sessionContent = '---\n{"session_id":"cli-test","status":"in_progress"}\n---\n# Session\n';
      const sessionPath = path.join(workspace, 'docs', 'maestro', 'state', 'active-session.md');
      fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
      fs.writeFileSync(sessionPath, sessionContent);

      const result = runScript('read-active-session.js', [], { cwd: workspace });
      assert.equal(result.status, 0);
      assert.equal(result.stdout, sessionContent);
    });
  });
});
