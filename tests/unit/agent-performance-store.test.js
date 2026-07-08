import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appendAgentPerformance, readAgentPerformance } from '../../dist/src/mcp/memory/agent-performance-store.js';
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

describe('agent-performance store', () => {
  it('returns an empty ledger when the file is absent', () => {
    assert.deepEqual(readAgentPerformance(makeWorkspace()), {
      schema_version: 1,
      records: [],
    });
  });

  it('appends records and round-trips them from disk', () => {
    const workspace = makeWorkspace();
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
    appendAgentPerformance(workspace, [first]);

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
    const workspace = makeWorkspace();
    appendAgentPerformance(workspace, [{ session_id: 's1', agent: 'coder', phase_id: 1 }]);
    appendAgentPerformance(workspace, [{ session_id: 's2', agent: 'tester', phase_id: 1 }]);
    const ledger = readAgentPerformance(workspace);
    assert.equal(ledger.records.length, 2);
    assert.equal(ledger.records[0].agent, 'coder');
    assert.equal(ledger.records[1].agent, 'tester');
  });

  it('ignores a non-array append payload', () => {
    const workspace = makeWorkspace();
    appendAgentPerformance(workspace, null);
    assert.deepEqual(readAgentPerformance(workspace), {
      schema_version: 1,
      records: [],
    });
  });

  it('preserves prior records when appending a non-array payload', () => {
    const workspace = makeWorkspace();
    appendAgentPerformance(workspace, [{ session_id: 's1', agent: 'coder', phase_id: 1 }]);
    appendAgentPerformance(workspace, null);
    assert.deepEqual(readAgentPerformance(workspace).records, [
      { session_id: 's1', agent: 'coder', phase_id: 1 },
    ]);
  });
});
