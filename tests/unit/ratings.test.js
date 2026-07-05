import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RATING_VALUES, handleRatePhase, handleRateSession, aggregateRatings } from '../../src/mcp/handlers/ratings.js';

function makeWorkspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-ratings-'));
  fs.mkdirSync(path.join(root, 'docs', 'maestro', 'knowledge'), {
    recursive: true,
    mode: 0o700,
  });
  return root;
}

function ratingsFile(root) {
  return path.join(root, 'docs', 'maestro', 'knowledge', 'ratings.jsonl');
}

function readRecords(root) {
  return fs
    .readFileSync(ratingsFile(root), 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

describe('ratings handlers', () => {
  it('exposes the thumbs vocabulary', () => {
    assert.deepEqual([...RATING_VALUES], ['up', 'down']);
  });

  it('appends a session rating as one JSONL record without a phase_id', () => {
    const root = makeWorkspace();
    const result = handleRateSession(
      { session_id: '2026-07-03-demo', rating: 'up', note: '  solid run  ' },
      root
    );
    assert.equal(result.recorded, true);
    assert.equal(result.rating.rating, 'up');
    assert.equal(result.rating.note, 'solid run');
    assert.equal(typeof result.rating.at, 'string');
    const records = readRecords(root);
    assert.equal(records.length, 1);
    assert.equal(records[0].session_id, '2026-07-03-demo');
    assert.equal(records[0].rating, 'up');
    assert.equal(records[0].note, 'solid run');
    assert.equal(
      Object.prototype.hasOwnProperty.call(records[0], 'phase_id'),
      false
    );
  });

  it('appends a phase rating and preserves prior records (true append)', () => {
    const root = makeWorkspace();
    handleRateSession({ session_id: 's1', rating: 'up' }, root);
    const result = handleRatePhase(
      { session_id: 's1', phase_id: 2, rating: 'down' },
      root
    );
    assert.equal(result.rating.phase_id, 2);
    assert.equal(result.rating.note, null);
    const records = readRecords(root);
    assert.equal(records.length, 2);
    assert.equal(records[1].phase_id, 2);
    assert.equal(records[1].rating, 'down');
  });

  it('rejects an invalid rating value', () => {
    const root = makeWorkspace();
    assert.throws(
      () => handleRateSession({ session_id: 's1', rating: 'meh' }, root),
      /rating must be either/
    );
  });

  it('rejects a phase rating with no phase_id', () => {
    const root = makeWorkspace();
    assert.throws(
      () => handleRatePhase({ session_id: 's1', rating: 'up' }, root),
      /phase_id is required/
    );
  });

  it('aggregateRatings produces a deterministic thumbs rollup', () => {
    const rollup = aggregateRatings([
      { session_id: 'a', rating: 'up' },
      { session_id: 'a', rating: 'down' },
      { session_id: 'b', rating: 'up' },
      { session_id: 'b', rating: 'up' },
      { rating: 'garbage' },
      null,
    ]);
    assert.equal(rollup.total, 4);
    assert.equal(rollup.up, 3);
    assert.equal(rollup.down, 1);
    assert.equal(rollup.satisfaction_ratio, 0.75);
    assert.deepEqual(rollup.by_session, {
      a: { up: 1, down: 1 },
      b: { up: 2, down: 0 },
    });
  });

  it('aggregateRatings returns a zeroed rollup for an empty corpus', () => {
    const rollup = aggregateRatings([]);
    assert.deepEqual(rollup, {
      total: 0,
      up: 0,
      down: 0,
      satisfaction_ratio: 0,
      by_session: {},
    });
  });
});
