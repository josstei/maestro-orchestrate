import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  emptyProfile,
  PROFILE_SCHEMA_VERSION,
  readProfile,
  writeProfile,
} from '../../dist/src/mcp/memory/project-profile-store.js';

describe('project-profile store', () => {
  let tmpRoot;
  let savedStateDirEnv;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-memory-'));
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

  it('readProfile returns an empty profile when no file exists', () => {
    assert.deepEqual(readProfile(tmpRoot), emptyProfile());
  });

  it('writeProfile uses an injected clock instead of the real wall clock', () => {
    const fixedInstant = new Date('2020-01-01T00:00:00.000Z');
    const written = writeProfile(
      tmpRoot,
      { build_commands: ['npm run build'] },
      { clock: { now: () => fixedInstant } }
    );
    assert.equal(written.updated, fixedInstant.toISOString());
    assert.equal(readProfile(tmpRoot).updated, fixedInstant.toISOString());
  });

  it('defaults to a real clock when none is injected', () => {
    const before = Date.now();
    const written = writeProfile(tmpRoot, { build_commands: [] });
    const after = Date.now();
    const writtenMs = new Date(written.updated).getTime();
    assert.ok(writtenMs >= before && writtenMs <= after);
  });

  it('writeProfile then readProfile round-trips normalized fields', () => {
    writeProfile(tmpRoot, {
      build_commands: ['npm run build', 'npm run build'],
      test_commands: ['  npm test  '],
      lint_commands: [],
      conventions: ['no inline comments'],
      do_not_touch: ['src/generated/'],
      preferred_agents: ['coder'],
      blocked_agents: [],
    });
    const profile = readProfile(tmpRoot);
    assert.equal(profile.schema_version, PROFILE_SCHEMA_VERSION);
    assert.deepEqual(profile.build_commands, ['npm run build']);
    assert.deepEqual(profile.test_commands, ['npm test']);
    assert.deepEqual(profile.conventions, ['no inline comments']);
    assert.deepEqual(profile.do_not_touch, ['src/generated/']);
    assert.deepEqual(profile.preferred_agents, ['coder']);
    assert.equal(typeof profile.updated, 'string');
  });

});
