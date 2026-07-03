'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  MemoryStore,
  emptyProfile,
  PROFILE_SCHEMA_VERSION,
} = require('../../src/mcp/memory/memory-store');

describe('MemoryStore', () => {
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
    const store = MemoryStore.forProjectRoot(tmpRoot);
    assert.deepEqual(store.readProfile(), emptyProfile());
  });

  it('writeProfile then readProfile round-trips normalized fields', () => {
    const store = MemoryStore.forProjectRoot(tmpRoot);
    store.writeProfile({
      build_commands: ['npm run build', 'npm run build'],
      test_commands: ['  npm test  '],
      lint_commands: [],
      conventions: ['no inline comments'],
      do_not_touch: ['src/generated/'],
      preferred_agents: ['coder'],
      blocked_agents: [],
    });
    const profile = store.readProfile();
    assert.equal(profile.schema_version, PROFILE_SCHEMA_VERSION);
    assert.deepEqual(profile.build_commands, ['npm run build']);
    assert.deepEqual(profile.test_commands, ['npm test']);
    assert.deepEqual(profile.conventions, ['no inline comments']);
    assert.deepEqual(profile.do_not_touch, ['src/generated/']);
    assert.deepEqual(profile.preferred_agents, ['coder']);
    assert.equal(typeof profile.updated, 'string');
  });

  it('appendAgentPerformance accumulates records into agent-performance.json', () => {
    const store = MemoryStore.forProjectRoot(tmpRoot);
    store.appendAgentPerformance({ agent: 'coder', retry_count: 0 });
    store.appendAgentPerformance({ agent: 'tester', retry_count: 1 });
    const records = store.readAgentPerformance();
    assert.equal(records.length, 2);
    assert.equal(records[0].agent, 'coder');
    assert.equal(records[1].retry_count, 1);
  });

  it('readAgentPerformance returns [] when no ledger exists', () => {
    const store = MemoryStore.forProjectRoot(tmpRoot);
    assert.deepEqual(store.readAgentPerformance(), []);
  });

  it('appendRating accumulates JSONL rating records', () => {
    const store = MemoryStore.forProjectRoot(tmpRoot);
    store.appendRating({ scope: 'session', rating: 'up' });
    store.appendRating({ scope: 'phase', rating: 'down', note: 'flaky' });
    const ratings = store.readRatings();
    assert.equal(ratings.length, 2);
    assert.equal(ratings[0].rating, 'up');
    assert.equal(ratings[1].note, 'flaky');
  });
});
