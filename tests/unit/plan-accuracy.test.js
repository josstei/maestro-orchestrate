'use strict';

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { MemoryStore } = require('../../src/mcp/memory/memory-store');
const {
  recordPlanAccuracy,
  handleGetPlanAccuracy,
} = require('../../src/mcp/handlers/plan-accuracy');

const tmpRoots = [];

function makeWorkspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-plan-accuracy-'));
  tmpRoots.push(dir);
  return dir;
}

function planAccuracyPath(workspace) {
  return path.join(
    workspace,
    'docs',
    'maestro',
    'knowledge',
    'plan-accuracy.jsonl'
  );
}

after(() => {
  for (const root of tmpRoots) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('MemoryStore plan-accuracy ledger', () => {
  it('returns [] when the JSONL ledger is absent', () => {
    const store = new MemoryStore(makeWorkspace());
    assert.deepEqual(store.readPlanAccuracy(), []);
  });

  it('appends bare JSONL plan-accuracy records across calls', () => {
    const workspace = makeWorkspace();
    const store = new MemoryStore(workspace);
    store.appendPlanAccuracy({ session_id: 's1', precision: 1 });
    store.appendPlanAccuracy({ session_id: 's2', recall: 0.5 });

    const records = store.readPlanAccuracy();
    assert.deepEqual(
      records.map((record) => record.session_id),
      ['s1', 's2']
    );

    const lines = fs.readFileSync(planAccuracyPath(workspace), 'utf8').trim().split('\n');
    assert.equal(lines.length, 2);
    assert.equal(JSON.parse(lines[0]).session_id, 's1');
    assert.equal(Object.hasOwn(JSON.parse(lines[0]), 'schema_version'), false);
  });
});

describe('recordPlanAccuracy', () => {
  it('records precision and recall from planned vs actual phase file sets', () => {
    const workspace = makeWorkspace();
    const record = recordPlanAccuracy(
      {
        session_id: 'session-1',
        phases: [
          {
            id: 1,
            planned_files: ['a.js', 'b.js'],
            files_created: ['a.js'],
            files_modified: ['c.js'],
            retry_count: 2,
          },
        ],
      },
      workspace
    );

    assert.equal(record.session_id, 'session-1');
    assert.equal(record.planned_file_count, 2);
    assert.equal(record.actual_file_count, 2);
    assert.equal(record.matched_file_count, 1);
    assert.equal(record.precision, 0.5);
    assert.equal(record.recall, 0.5);
    assert.equal(record.phase_count, 1);
    assert.equal(record.total_retries, 2);
    assert.equal(typeof record.created, 'string');
    assert.deepEqual(new MemoryStore(workspace).readPlanAccuracy(), [record]);
  });
});

describe('handleGetPlanAccuracy', () => {
  it('aggregates multiple records into average metrics', () => {
    const workspace = makeWorkspace();
    recordPlanAccuracy(
      {
        session_id: 'half',
        phases: [
          {
            id: 1,
            planned_files: ['a.js', 'b.js'],
            files_created: ['a.js'],
            files_modified: ['c.js'],
            retry_count: 1,
          },
        ],
      },
      workspace
    );
    recordPlanAccuracy(
      {
        session_id: 'full',
        phases: [
          {
            id: 1,
            planned_files: ['x.js'],
            files_created: ['x.js'],
            files_modified: [],
            retry_count: 0,
          },
          {
            id: 2,
            planned_files: [],
            files_created: [],
            files_modified: [],
            retry_count: 0,
          },
        ],
      },
      workspace
    );

    const accuracy = handleGetPlanAccuracy({}, workspace);
    assert.equal(accuracy.samples, 2);
    assert.equal(accuracy.avg_precision, 0.75);
    assert.equal(accuracy.avg_recall, 0.75);
    assert.equal(accuracy.avg_phase_count, 1.5);
    assert.equal(accuracy.records.length, 2);
  });

  it('returns zeroed aggregates for an empty ledger', () => {
    const accuracy = handleGetPlanAccuracy({}, makeWorkspace());
    assert.equal(accuracy.samples, 0);
    assert.equal(accuracy.avg_precision, 0);
    assert.equal(accuracy.avg_recall, 0);
    assert.equal(accuracy.avg_phase_count, 0);
    assert.deepEqual(accuracy.records, []);
  });
});
