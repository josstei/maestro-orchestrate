import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readRatings } from '../../dist/src/mcp/memory/jsonl-ledgers.js';
import { handleRate } from '../../dist/src/mcp/handlers/ratings.js';
import { handleGetAgentPerformance } from '../../dist/src/mcp/handlers/agent-performance.js';

function makeWorkspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-perf-ratings-'));
  fs.mkdirSync(path.join(root, 'docs', 'maestro', 'knowledge'), {
    recursive: true,
    mode: 0o700,
  });
  return root;
}

describe('ratings JSONL ledger', () => {
  it('returns [] when no ratings ledger exists', () => {
    const root = makeWorkspace();
    assert.deepEqual(readRatings(root), []);
  });

  it('reads back every appended rating record', () => {
    const root = makeWorkspace();
    handleRate({ target: 'session', session_id: 's1', rating: 'up' }, root);
    handleRate({ target: 'session', session_id: 's2', rating: 'down', note: 'flaky' }, root);
    const records = readRatings(root);
    assert.equal(records.length, 2);
    assert.equal(records[0].session_id, 's1');
    assert.equal(records[1].rating, 'down');
    assert.equal(records[1].note, 'flaky');
  });
});

describe('get_agent_performance surfaces ratings', () => {
  it('includes a deterministic ratings rollup drawn from ratings.jsonl', () => {
    const root = makeWorkspace();
    handleRate({ target: 'session', session_id: 's1', rating: 'up' }, root);
    handleRate({ target: 'session', session_id: 's1', rating: 'down' }, root);
    handleRate({ target: 'session', session_id: 's2', rating: 'up' }, root);
    const result = handleGetAgentPerformance({}, root);
    assert.ok(result.ratings, 'response is missing the ratings rollup');
    assert.equal(result.ratings.total, 3);
    assert.equal(result.ratings.up, 2);
    assert.equal(result.ratings.down, 1);
    assert.deepEqual(result.ratings.by_session, {
      s1: { up: 1, down: 1 },
      s2: { up: 1, down: 0 },
    });
  });
});
