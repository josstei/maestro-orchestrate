'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  handleGetProjectProfile,
  handleUpdateProjectProfile,
} = require('../../src/mcp/handlers/project-profile');

describe('project-profile handlers', () => {
  let tmpRoot;
  let savedStateDirEnv;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-profile-'));
    savedStateDirEnv = process.env.MAESTRO_STATE_DIR;
    delete process.env.MAESTRO_STATE_DIR;
  });

  afterEach(() => {
    if (savedStateDirEnv == null) {
      delete process.env.MAESTRO_STATE_DIR;
    } else {
      process.env.MAESTRO_STATE_DIR = savedStateDirEnv;
    }
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('handleGetProjectProfile returns an empty profile before any update', () => {
    const result = handleGetProjectProfile({}, tmpRoot);
    assert.equal(result.profile.schema_version, 1);
    assert.deepEqual(result.profile.build_commands, []);
    assert.equal(result.profile.updated, null);
  });

  it('handleUpdateProjectProfile persists supplied fields and get reflects them', () => {
    const updated = handleUpdateProjectProfile(
      { build_commands: ['npm run build'], do_not_touch: ['src/generated/'] },
      tmpRoot
    );
    assert.deepEqual(updated.profile.build_commands, ['npm run build']);
    assert.deepEqual(updated.profile.do_not_touch, ['src/generated/']);
    assert.equal(typeof updated.profile.updated, 'string');

    const fetched = handleGetProjectProfile({}, tmpRoot);
    assert.deepEqual(fetched.profile.build_commands, ['npm run build']);
    assert.deepEqual(fetched.profile.do_not_touch, ['src/generated/']);
  });

  it('handleUpdateProjectProfile leaves unsupplied fields unchanged', () => {
    handleUpdateProjectProfile({ build_commands: ['npm run build'] }, tmpRoot);
    const result = handleUpdateProjectProfile({ test_commands: ['npm test'] }, tmpRoot);
    assert.deepEqual(result.profile.build_commands, ['npm run build']);
    assert.deepEqual(result.profile.test_commands, ['npm test']);
  });
});
