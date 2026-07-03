'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { NotFoundError } = require('../../src/lib/errors');
const {
  handleInstantiateSessionBlueprint,
  handleListSessionBlueprints,
} = require('../../src/mcp/handlers/session-blueprints');

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
