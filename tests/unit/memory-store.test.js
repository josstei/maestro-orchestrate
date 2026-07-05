import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MemoryStore, emptyProfile, PROFILE_SCHEMA_VERSION } from '../../src/mcp/memory/memory-store.js';

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
    store.appendAgentPerformance([{ agent: 'coder', retry_count: 0 }]);
    store.appendAgentPerformance([{ agent: 'tester', retry_count: 1 }]);
    const ledger = store.readAgentPerformance();
    assert.equal(ledger.records.length, 2);
    assert.equal(ledger.records[0].agent, 'coder');
    assert.equal(ledger.records[1].retry_count, 1);
  });

  it('readAgentPerformance returns an empty ledger when no ledger exists', () => {
    const store = MemoryStore.forProjectRoot(tmpRoot);
    assert.deepEqual(store.readAgentPerformance(), { schema_version: 1, records: [] });
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
