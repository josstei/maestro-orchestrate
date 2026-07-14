import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { NotFoundError } from '../../dist/src/lib/errors/index.js';
import { handleInstantiateSessionBlueprint, handleListSessionBlueprints } from '../../dist/src/mcp/handlers/session-blueprints.js';
const PROJECT_ROOT = process.cwd();
const PROJECT_SRC = path.join(PROJECT_ROOT, 'src');

function createRegistryRuntimeRoot(t, registry, payload) {
  const runtimeSrcRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-blueprint-registry-'));
  const generatedDir = path.join(runtimeSrcRoot, 'generated');
  const registryPath = path.join(generatedDir, 'runtime-content-registry.json');
  fs.mkdirSync(generatedDir, { recursive: true });
  fs.writeFileSync(
    registryPath,
    `${JSON.stringify({
      schemaVersion: 2,
      storage: 'packed',
      resources: {},
      agents: {},
      agentProfiles: {},
      blueprints: {},
      ...registry,
    })}\n`,
    'utf8'
  );
  if (payload !== undefined) {
    fs.writeFileSync(
      path.join(generatedDir, registry.payload || 'runtime-content-registry.txt'),
      payload
    );
  }
  t.after(() => fs.rmSync(runtimeSrcRoot, { recursive: true, force: true }));
  return { runtimeSrcRoot, registryPath };
}

describe('session blueprints', () => {
  it('lists authored seed blueprints by id and title', () => {
    const result = handleListSessionBlueprints({ runtimeSrcRoot: PROJECT_SRC });

    assert.deepEqual(result.blueprints, [
      { id: 'add-db-migration', title: 'Add Database Migration' },
      { id: 'add-rest-endpoint', title: 'Add REST Endpoint' },
    ]);
  });

  it('instantiates blueprint phases with create_session-compatible shape', () => {
    const result = handleInstantiateSessionBlueprint(
      { blueprint_id: 'add-rest-endpoint', task: 'add /users endpoint' },
      { runtimeSrcRoot: PROJECT_SRC }
    );

    assert.equal(result.task, 'add /users endpoint');
    assert.equal(typeof result.design_outline, 'string');
    assert.ok(result.design_outline.length > 0);
    assert.equal(result.phases.length, 5);

    result.phases.forEach((phase, index) => {
      assert.deepEqual(
        Object.keys(phase).sort(),
        ['agent', 'blocked_by', 'id', 'name', 'parallel']
      );
      assert.equal(phase.id, index + 1);
      assert.equal(typeof phase.name, 'string');
      assert.ok(phase.name.length > 0);
      assert.equal(typeof phase.agent, 'string');
      assert.equal(typeof phase.parallel, 'boolean');
      assert.equal(Array.isArray(phase.blocked_by), true);
    });
  });

  it('fails explicitly when the required manifest is missing', (t) => {
    const runtimeSrcRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-blueprint-missing-'));
    t.after(() => fs.rmSync(runtimeSrcRoot, { recursive: true, force: true }));

    assert.throws(
      () => handleListSessionBlueprints({ runtimeSrcRoot }),
      (error) => error.code === 'ENOENT' && error.path.endsWith('runtime-content-registry.json')
    );
  });

  it('throws NotFoundError for an unknown blueprint id', () => {
    assert.throws(
      () =>
        handleInstantiateSessionBlueprint(
          { blueprint_id: 'missing-blueprint', task: 'do work' },
          { runtimeSrcRoot: PROJECT_SRC }
        ),
      NotFoundError
    );
  });

  it('reads one packed registry and payload while listing multiple blueprints', (t) => {
    const first = fs.readFileSync(
      path.join(PROJECT_ROOT, 'src', 'templates', 'session-blueprints', 'add-db-migration.md'),
      'utf8'
    );
    const second = fs.readFileSync(
      path.join(PROJECT_ROOT, 'src', 'templates', 'session-blueprints', 'add-rest-endpoint.md'),
      'utf8'
    );
    const payloadName = 'runtime-content-registry.txt.gz';
    const { runtimeSrcRoot, registryPath } = createRegistryRuntimeRoot(
      t,
      {
        payload: payloadName,
        payloadEncoding: 'gzip',
        blueprints: {
          'add-db-migration': [
            'templates/session-blueprints/add-db-migration.md',
            0,
            first.length,
          ],
          'add-rest-endpoint': [
            'templates/session-blueprints/add-rest-endpoint.md',
            first.length,
            second.length,
          ],
        },
      },
      gzipSync(first + second)
    );
    const payloadPath = path.join(runtimeSrcRoot, 'generated', payloadName);
    const realPayloadPath = fs.realpathSync(payloadPath);
    const originalReadFileSync = fs.readFileSync;
    let registryReads = 0;
    let payloadReads = 0;
    t.mock.method(fs, 'readFileSync', function (...args) {
      if (String(args[0]) === registryPath) registryReads += 1;
      if (String(args[0]) === realPayloadPath) payloadReads += 1;
      return originalReadFileSync.apply(this, args);
    });

    const result = handleListSessionBlueprints({ runtimeSrcRoot });

    assert.deepEqual(result.blueprints, [
      { id: 'add-db-migration', title: 'Add Database Migration' },
      { id: 'add-rest-endpoint', title: 'Add REST Endpoint' },
    ]);
    assert.equal(registryReads, 1);
    assert.equal(payloadReads, 1);
  });

  it('keeps registry corruption as a thrown error and missing entries as NotFoundError', (t) => {
    const { runtimeSrcRoot, registryPath } = createRegistryRuntimeRoot(t, {});
    fs.writeFileSync(registryPath, '{ malformed json', 'utf8');

    assert.throws(
      () => handleListSessionBlueprints({ runtimeSrcRoot }),
      SyntaxError
    );

    fs.writeFileSync(registryPath, `${JSON.stringify({
      schemaVersion: 2,
      storage: 'inline',
      resources: {},
      agents: {},
      agentProfiles: {},
      blueprints: {},
    })}\n`, 'utf8');
    assert.throws(
      () => handleInstantiateSessionBlueprint(
        { blueprint_id: 'missing-blueprint', task: 'do work' },
        { runtimeSrcRoot }
      ),
      NotFoundError
    );
  });

  it('rethrows a packed blueprint payload read failure without a content envelope', (t) => {
    const payloadName = 'missing-blueprints.gz';
    const { runtimeSrcRoot } = createRegistryRuntimeRoot(t, {
      payload: payloadName,
      payloadEncoding: 'gzip',
      blueprints: {
        'add-rest-endpoint': [
          'templates/session-blueprints/add-rest-endpoint.md',
          0,
          10,
        ],
      },
    });
    const payloadPath = path.join(runtimeSrcRoot, 'generated', payloadName);

    assert.throws(
      () => handleListSessionBlueprints({ runtimeSrcRoot }),
      (error) => error.code === 'ENOENT' && error.path === payloadPath
    );
  });

  it('treats a missing file-backed blueprint as not found without hiding payload failures', (t) => {
    const { runtimeSrcRoot } = createRegistryRuntimeRoot(t, {
      storage: 'file',
      blueprints: {
        missing: 'templates/session-blueprints/missing.md',
      },
    });

    assert.deepEqual(handleListSessionBlueprints({ runtimeSrcRoot }).blueprints, []);
    assert.throws(
      () => handleInstantiateSessionBlueprint(
        { blueprint_id: 'missing', task: 'do work' },
        { runtimeSrcRoot }
      ),
      NotFoundError
    );
  });

  it('filters malformed registry entries and treats a direct malformed read as missing', (t) => {
    const validContent = fs.readFileSync(
      path.join(PROJECT_ROOT, 'src', 'templates', 'session-blueprints', 'add-rest-endpoint.md'),
      'utf8'
    );
    const { runtimeSrcRoot } = createRegistryRuntimeRoot(t, {
      blueprints: {
        malformed: ['templates/session-blueprints/malformed.md', 'bad-offset', 4],
        'add-rest-endpoint': {
          kind: 'inline',
          relativePath: 'templates/session-blueprints/add-rest-endpoint.md',
          content: validContent,
        },
      },
    });

    assert.deepEqual(handleListSessionBlueprints({ runtimeSrcRoot }).blueprints, [
      { id: 'add-rest-endpoint', title: 'Add REST Endpoint' },
    ]);
    assert.throws(
      () => handleInstantiateSessionBlueprint(
        { blueprint_id: 'malformed', task: 'do work' },
        { runtimeSrcRoot }
      ),
      NotFoundError
    );
  });
});
