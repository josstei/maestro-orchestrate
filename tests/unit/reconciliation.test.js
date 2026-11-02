'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { withCwd, withEnv } = require('../support/env');
const { makeTempDir, writeTree } = require('../support/fs');
const { SessionWorkspace, singlePhase } = require('../support/session-server');

// An initialized workspace (fresh temp dir by default) holding the one-phase 'recon-test' session.
async function bootstrap(dir) {
  const workspace = await SessionWorkspace.create(dir);
  await workspace.createSession('recon-test', { phases: singlePhase(['src/foo.js']) });
  return workspace;
}

// Lets the clock move past the phase start so files written next count as changes.
function waitForMtime() {
  return new Promise((r) => setTimeout(r, 50));
}

function scan(workspace) {
  return workspace.call('scan_phase_changes', { session_id: 'recon-test', phase_id: 1 });
}

describe('scan_phase_changes', () => {
  it('returns files created after the phase started', async () => {
    const workspace = await bootstrap();

    await waitForMtime();
    const createdPaths = [path.join('src', 'foo.js'), path.join('src', 'bar.js')];
    for (const filePath of createdPaths) writeTree(workspace.dir, filePath, '// hi\n');

    const outcome = await scan(workspace);
    assert.equal(outcome.ok, true);
    const created = outcome.result.candidates.created;
    assert.deepEqual(created, createdPaths.sort());
  });

  it('excludes docs/maestro and .git paths', async () => {
    const workspace = await bootstrap();

    await waitForMtime();
    const ignoredPaths = [path.join('.git', 'HEAD'), path.join('docs', 'maestro', 'notes.md')];
    for (const filePath of ignoredPaths) writeTree(workspace.dir, filePath, '...');

    const outcome = await scan(workspace);
    assert.equal(outcome.ok, true);
    const created = outcome.result.candidates.created;
    for (const filePath of ignoredPaths) assert.equal(created.includes(filePath), false);
  });

  it('scans nested directories when the server cwd is inside an extension cache', async () => {
    // Claude Code launches the MCP server with cwd set to the plugin install dir
    // (e.g. ~/.claude/plugins/...), which is itself a cache path.
    const root = makeTempDir('maestro-recon-cwd-');
    const pluginCwd = path.join(root, 'home', '.claude', 'plugins', 'cache', 'maestro');
    fs.mkdirSync(pluginCwd, { recursive: true });
    fs.mkdirSync(path.join(root, 'workspace'));
    const workspace = await bootstrap(path.join(root, 'workspace'));

    await waitForMtime();
    writeTree(workspace.dir, 'src/lib/nested.js', '// hi\n');
    writeTree(workspace.dir, 'top.js', '// hi\n');

    const outcome = await withCwd(pluginCwd, () => scan(workspace));
    assert.equal(outcome.ok, true);
    const created = outcome.result.candidates.created;
    assert.ok(created.includes(path.join('src', 'lib', 'nested.js')));
    assert.ok(created.includes('top.js'));
  });

  for (const [name, arrange] of [
    ['excludes a custom MAESTRO_STATE_DIR',
      () => ({ dir: makeTempDir('maestro-recon-statedir-'), stateDir: '.maestro' })],
    ['excludes an absolute MAESTRO_STATE_DIR when the workspace is opened through a symlink', () => {
      const root = fs.realpathSync(makeTempDir('maestro-recon-link-'));
      fs.mkdirSync(path.join(root, 'real', '.maestro'), { recursive: true });
      fs.symlinkSync(path.join(root, 'real'), path.join(root, 'alias'), 'dir');
      return { dir: path.join(root, 'alias'), stateDir: path.join(root, 'alias', '.maestro') };
    }],
  ]) {
    it(name, async () => {
      const { dir, stateDir } = arrange();
      const outcome = await withEnv({ MAESTRO_STATE_DIR: stateDir }, async () => {
        const workspace = await bootstrap(dir);

        await waitForMtime();
        writeTree(dir, '.maestro/state/notes.md', '...');
        writeTree(dir, 'top.js', '// hi\n');

        return scan(workspace);
      });
      assert.equal(outcome.ok, true);
      const { created, modified } = outcome.result.candidates;
      assert.deepEqual(
        [...created, ...modified].filter((p) => p.startsWith('.maestro')),
        []
      );
      assert.ok(created.includes('top.js'));
    });
  }

  it('excludes extension cache directories inside the workspace', async () => {
    const workspace = await bootstrap();

    await waitForMtime();
    for (const cacheDir of [['.codex', 'plugins'], ['.claude', 'plugins']]) {
      writeTree(workspace.dir, path.join(...cacheDir, 'x', 'cached.js'), '// hi\n');
    }
    writeTree(workspace.dir, '.codex/config/kept.toml', '# hi\n');

    const outcome = await scan(workspace);
    assert.equal(outcome.ok, true);
    const created = outcome.result.candidates.created;
    assert.equal(created.includes(path.join('.codex', 'plugins', 'x', 'cached.js')), false);
    assert.equal(created.includes(path.join('.claude', 'plugins', 'x', 'cached.js')), false);
    assert.ok(created.includes(path.join('.codex', 'config', 'kept.toml')));
  });
});

describe('reconcile_phase', () => {
  it('rejects a call with no files and no downstream_context, or with only empty arrays and an unpopulated downstream_context', async () => {
    const emptyPayloads = [
      {},
      { files_created: [], files_modified: [], files_deleted: [], downstream_context: {} },
    ];
    for (const payload of emptyPayloads) {
      const workspace = await bootstrap();

      // A transition with no files and an empty handoff leaves the phase awaiting reconciliation.
      await workspace.transition('recon-test', 1);

      const outcome = await workspace.call('reconcile_phase', { session_id: 'recon-test', phase_id: 1, ...payload });
      assert.equal(outcome.ok, false, JSON.stringify(payload));
      assert.match(outcome.error || '', /reconcile_phase requires at least one/i);
    }
  });

  it('clears requires_reconciliation and writes file manifests in the hung-worker postmortem scenario', async () => {
    const workspace = await bootstrap();

    // The worker writes its files but hands off nothing, so a scan recovers them.
    await waitForMtime();
    writeTree(workspace.dir, 'index.html', '<html/>');
    writeTree(workspace.dir, 'assets/css/styles.css', 'body{}');
    await workspace.transition('recon-test', 1);

    const scanned = await scan(workspace);
    assert.equal(scanned.ok, true);
    assert.deepEqual(scanned.result.candidates.created, [
      path.join('assets', 'css', 'styles.css'),
      'index.html',
    ]);

    const outcome = await workspace.call('reconcile_phase', {
      session_id: 'recon-test',
      phase_id: 1,
      files_created: ['index.html', 'assets/css/styles.css'],
      downstream_context: {
        key_interfaces_introduced: [],
        patterns_established: [],
        integration_points: ['index.html'],
        assumptions: [],
        warnings: [],
      },
    });
    assert.equal(outcome.ok, true);
    assert.deepEqual(outcome.result.files_created, ['index.html', 'assets/css/styles.css']);

    const archive = await workspace.call('archive_session', { session_id: 'recon-test' });
    assert.equal(archive.ok, true);
  });
});
