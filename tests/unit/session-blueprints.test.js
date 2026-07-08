import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NotFoundError } from '../../dist/src/lib/errors/index.js';
import { handleInstantiateSessionBlueprint, handleListSessionBlueprints } from '../../dist/src/mcp/handlers/session-blueprints.js';
const PROJECT_ROOT = process.cwd();

describe('session blueprints', () => {
  it('lists authored seed blueprints by id and title', () => {
    const result = handleListSessionBlueprints({}, PROJECT_ROOT);

    assert.deepEqual(result.blueprints, [
      { id: 'add-db-migration', title: 'Add Database Migration' },
      { id: 'add-rest-endpoint', title: 'Add REST Endpoint' },
    ]);
  });

  it('instantiates blueprint phases with create_session-compatible shape', () => {
    const result = handleInstantiateSessionBlueprint(
      { blueprint_id: 'add-rest-endpoint', task: 'add /users endpoint' },
      PROJECT_ROOT
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

  it('falls back to source checkout blueprints when compiled runtime registry is absent', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-blueprint-fallback-'));

    try {
      const runtimeSrcRoot = path.join(tempRoot, 'dist', 'src');
      const sourceBlueprintDir = path.join(tempRoot, 'src', 'templates', 'session-blueprints');
      fs.mkdirSync(runtimeSrcRoot, { recursive: true });
      fs.mkdirSync(sourceBlueprintDir, { recursive: true });
      fs.copyFileSync(
        path.join(PROJECT_ROOT, 'src', 'templates', 'session-blueprints', 'add-rest-endpoint.md'),
        path.join(sourceBlueprintDir, 'add-rest-endpoint.md')
      );

      const listResult = handleListSessionBlueprints({ runtimeSrcRoot });
      const blueprintResult = handleInstantiateSessionBlueprint(
        { blueprint_id: 'add-rest-endpoint', task: 'add /users endpoint' },
        { runtimeSrcRoot }
      );

      assert.deepEqual(listResult.blueprints, [
        { id: 'add-rest-endpoint', title: 'Add REST Endpoint' },
      ]);
      assert.equal(blueprintResult.task, 'add /users endpoint');
      assert.equal(blueprintResult.phases.length, 5);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('throws NotFoundError for an unknown blueprint id', () => {
    assert.throws(
      () =>
        handleInstantiateSessionBlueprint(
          { blueprint_id: 'missing-blueprint', task: 'do work' },
          PROJECT_ROOT
        ),
      NotFoundError
    );
  });
});
