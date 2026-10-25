'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { withCwd, withEnv } = require('../support/env');
const { makeTempDir, writeTree } = require('../support/fs');
const {
  createInitializedSessionServer,
  sessionParams,
  singlePhase,
} = require('../support/session-server');

// An initialized workspace holding the one-phase 'recon-test' session.
async function bootstrap(workspace) {
  const server = await createInitializedSessionServer(workspace);
  await server.callTool(
    'create_session',
    sessionParams('recon-test', { phases: singlePhase(['src/foo.js']) }),
    workspace
  );
  return server;
}

// Lets the clock move past the phase start so files written next count as changes.
function waitForMtime() {
  return new Promise((r) => setTimeout(r, 50));
}

function scan(server, workspace) {
  return server.callTool(
    'scan_phase_changes',
    { session_id: 'recon-test', phase_id: 1 },
    workspace
  );
}

// Completes phase 1 with no files and an empty downstream_context, which leaves
// the phase awaiting reconciliation.
function completePhaseWithoutHandoff(server, workspace) {
  return server.callTool(
    'transition_phase',
    {
      session_id: 'recon-test',
      completed_phase_id: 1,
      files_created: [],
      files_modified: [],
      files_deleted: [],
      downstream_context: {},
    },
    workspace
  );
}

describe('scan_phase_changes', () => {
  it('returns files created after the phase started', async () => {
    const workspace = makeTempDir('maestro-recon-');
    const server = await bootstrap(workspace);

    await waitForMtime();
    const createdPaths = [path.join('src', 'foo.js'), path.join('src', 'bar.js')];
    for (const filePath of createdPaths) writeTree(workspace, filePath, '// hi\n');

    const outcome = await scan(server, workspace);
    assert.equal(outcome.ok, true);
    const created = outcome.result.candidates.created;
    assert.deepEqual(created, createdPaths.sort());
  });

  it('excludes docs/maestro and .git paths', async () => {
    const workspace = makeTempDir('maestro-recon-exc-');
    const server = await bootstrap(workspace);

    await waitForMtime();
    const ignoredPaths = [path.join('.git', 'HEAD'), path.join('docs', 'maestro', 'notes.md')];
    for (const filePath of ignoredPaths) writeTree(workspace, filePath, '...');

    const outcome = await scan(server, workspace);
    assert.equal(outcome.ok, true);
    const created = outcome.result.candidates.created;
    for (const filePath of ignoredPaths) assert.equal(created.includes(filePath), false);
  });

  it('scans nested directories when the server cwd is inside an extension cache', async () => {
    // Claude Code launches the MCP server with cwd set to the plugin install dir
    // (e.g. ~/.claude/plugins/...), which is itself a cache path.
    const root = makeTempDir('maestro-recon-cwd-');
    const pluginCwd = path.join(root, 'home', '.claude', 'plugins', 'cache', 'maestro');
    const workspace = path.join(root, 'workspace');
    fs.mkdirSync(pluginCwd, { recursive: true });
    fs.mkdirSync(workspace);
    const server = await bootstrap(workspace);

    await waitForMtime();
    writeTree(workspace, 'src/lib/nested.js', '// hi\n');
    writeTree(workspace, 'top.js', '// hi\n');

    const outcome = await withCwd(pluginCwd, () => scan(server, workspace));
    assert.equal(outcome.ok, true);
    const created = outcome.result.candidates.created;
    assert.ok(created.includes(path.join('src', 'lib', 'nested.js')));
    assert.ok(created.includes('top.js'));
  });

  it('excludes a custom MAESTRO_STATE_DIR', async () => {
    const workspace = makeTempDir('maestro-recon-statedir-');
    const outcome = await withEnv({ MAESTRO_STATE_DIR: '.maestro' }, async () => {
      const server = await bootstrap(workspace);

      await waitForMtime();
      writeTree(workspace, '.maestro/state/notes.md', '...');
      writeTree(workspace, 'top.js', '// hi\n');

      return scan(server, workspace);
    });
    assert.equal(outcome.ok, true);
    const { created, modified } = outcome.result.candidates;
    assert.deepEqual(
      [...created, ...modified].filter((p) => p.startsWith('.maestro')),
      []
    );
    assert.ok(created.includes('top.js'));
  });

  it('excludes an absolute MAESTRO_STATE_DIR when the workspace is opened through a symlink', async () => {
    const root = fs.realpathSync(makeTempDir('maestro-recon-link-'));
    const realWorkspace = path.join(root, 'real');
    const workspace = path.join(root, 'alias');
    fs.mkdirSync(path.join(realWorkspace, '.maestro'), { recursive: true });
    fs.symlinkSync(realWorkspace, workspace, 'dir');
    const outcome = await withEnv(
      { MAESTRO_STATE_DIR: path.join(workspace, '.maestro') },
      async () => {
        const server = await bootstrap(workspace);

        await waitForMtime();
        writeTree(workspace, '.maestro/state/notes.md', '...');
        writeTree(workspace, 'top.js', '// hi\n');

        return scan(server, workspace);
      }
    );
    assert.equal(outcome.ok, true);
    const { created, modified } = outcome.result.candidates;
    assert.deepEqual(
      [...created, ...modified].filter((p) => p.startsWith('.maestro')),
      []
    );
    assert.ok(created.includes('top.js'));
  });

  it('excludes extension cache directories inside the workspace', async () => {
    const workspace = makeTempDir('maestro-recon-cache-');
    const server = await bootstrap(workspace);

    await waitForMtime();
    for (const cacheDir of [['.codex', 'plugins'], ['.claude', 'plugins']]) {
      writeTree(workspace, path.join(...cacheDir, 'x', 'cached.js'), '// hi\n');
    }
    writeTree(workspace, '.codex/config/kept.toml', '# hi\n');

    const outcome = await scan(server, workspace);
    assert.equal(outcome.ok, true);
    const created = outcome.result.candidates.created;
    assert.equal(created.includes(path.join('.codex', 'plugins', 'x', 'cached.js')), false);
    assert.equal(created.includes(path.join('.claude', 'plugins', 'x', 'cached.js')), false);
    assert.ok(created.includes(path.join('.codex', 'config', 'kept.toml')));
  });
});

describe('reconcile_phase — empty payload', () => {
  it('rejects a call with no files and no downstream_context, or with only empty arrays and an unpopulated downstream_context', async () => {
    const emptyPayloads = [
      {},
      { files_created: [], files_modified: [], files_deleted: [], downstream_context: {} },
    ];
    for (const payload of emptyPayloads) {
      const workspace = makeTempDir('maestro-recon-empty-');
      const server = await bootstrap(workspace);

      await completePhaseWithoutHandoff(server, workspace);

      const outcome = await server.callTool(
        'reconcile_phase',
        { session_id: 'recon-test', phase_id: 1, ...payload },
        workspace
      );
      assert.equal(outcome.ok, false, JSON.stringify(payload));
      assert.match(outcome.error || '', /reconcile_phase requires at least one/i);
    }
  });
});

describe('reconcile_phase', () => {
  it('clears requires_reconciliation and writes file manifests in the hung-worker postmortem scenario', async () => {
    const workspace = makeTempDir('maestro-recon-e2e-');
    const server = await bootstrap(workspace);

    // The worker writes its files but hands off nothing, so a scan recovers them.
    await waitForMtime();
    writeTree(workspace, 'index.html', '<html/>');
    writeTree(workspace, 'assets/css/styles.css', 'body{}');
    await completePhaseWithoutHandoff(server, workspace);

    const scanned = await scan(server, workspace);
    assert.equal(scanned.ok, true);
    assert.deepEqual(scanned.result.candidates.created, [
      path.join('assets', 'css', 'styles.css'),
      'index.html',
    ]);

    const outcome = await server.callTool(
      'reconcile_phase',
      {
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
      },
      workspace
    );
    assert.equal(outcome.ok, true);
    assert.deepEqual(outcome.result.files_created, ['index.html', 'assets/css/styles.css']);

    const archive = await server.callTool(
      'archive_session',
      { session_id: 'recon-test' },
      workspace
    );
    assert.equal(archive.ok, true);
  });
});
