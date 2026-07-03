'use strict';

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { MemoryStore } = require('../../src/mcp/memory/memory-store');

const tmpRoots = [];

function makeWorkspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-agent-perf-store-'));
  tmpRoots.push(dir);
  return dir;
}

after(() => {
  for (const root of tmpRoots) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('MemoryStore agent-performance ledger', () => {
  it('returns an empty ledger when the file is absent', () => {
    const store = new MemoryStore(makeWorkspace());
    assert.deepEqual(store.readAgentPerformance(), {
      schema_version: 1,
      records: [],
    });
  });

  it('appends records and round-trips them from disk', () => {
    const workspace = makeWorkspace();
    const store = new MemoryStore(workspace);
    const first = {
      session_id: 's1',
      agent: 'coder',
      phase_id: 1,
      retry_count: 1,
      blocker_count: 2,
      review_finding_count: 3,
      phase_duration_ms: 1000,
      token_usage: { input: 10, output: 20, cached: 5 },
    };
    store.appendAgentPerformance([first]);

    const onDisk = JSON.parse(
      fs.readFileSync(
        path.join(workspace, 'docs', 'maestro', 'knowledge', 'agent-performance.json'),
        'utf8'
      )
    );
    assert.equal(onDisk.schema_version, 1);
    assert.equal(onDisk.records.length, 1);
    assert.deepEqual(onDisk.records[0], first);
  });

  it('append-merges across calls without dropping prior records', () => {
    const store = new MemoryStore(makeWorkspace());
    store.appendAgentPerformance([{ session_id: 's1', agent: 'coder', phase_id: 1 }]);
    store.appendAgentPerformance([{ session_id: 's2', agent: 'tester', phase_id: 1 }]);
    const ledger = store.readAgentPerformance();
    assert.equal(ledger.records.length, 2);
    assert.equal(ledger.records[0].agent, 'coder');
    assert.equal(ledger.records[1].agent, 'tester');
  });

  it('ignores a non-array append payload', () => {
    const store = new MemoryStore(makeWorkspace());
    store.appendAgentPerformance(null);
    assert.deepEqual(store.readAgentPerformance(), {
      schema_version: 1,
      records: [],
    });
  });
});
