import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { recordAgentPerformance, handleGetAgentPerformance } from '../../dist/src/mcp/handlers/agent-performance.js';
const tmpRoots = [];

function makeWorkspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-agent-perf-'));
  tmpRoots.push(dir);
  return dir;
}

function writeLedger(workspace, ledger) {
  const file = path.join(
    workspace,
    'docs',
    'maestro',
    'knowledge',
    'agent-performance.json'
  );
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(ledger));
}

after(() => {
  for (const root of tmpRoots) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('recordAgentPerformance', () => {
  it('projects completed-session phase state into per-agent records', () => {
    const workspace = makeWorkspace();
    const state = {
      session_id: 's1',
      phases: [
        {
          id: 1,
          agents: ['coder'],
          retry_count: 1,
          blocker_count: 2,
          review_finding_count: 3,
          duration_ms: 1000,
          token_usage: { input: 10, output: 20, cached: 5 },
        },
        {
          id: 2,
          agents: ['tester'],
          retry_count: 0,
          blocker_count: 0,
          review_finding_count: 1,
          duration_ms: 500,
        },
      ],
    };
    const records = recordAgentPerformance(state, workspace);
    assert.equal(records.length, 2);
    assert.equal(records[0].agent, 'coder');
    assert.equal(records[0].session_id, 's1');
    assert.equal(records[0].blocker_count, 2);
    assert.deepEqual(records[1].token_usage, { input: 0, output: 0, cached: 0 });
    assert.equal(records[1].phase_duration_ms, 500);
  });

  it('records a phase with no agent under "unassigned"', () => {
    const workspace = makeWorkspace();
    const records = recordAgentPerformance(
      { session_id: 's2', phases: [{ id: 1, agents: [] }] },
      workspace
    );
    assert.equal(records[0].agent, 'unassigned');
  });
});

describe('handleGetAgentPerformance', () => {
  it('aggregates per-agent priors from the durable ledger', () => {
    const workspace = makeWorkspace();
    recordAgentPerformance(
      {
        session_id: 's1',
        phases: [
          {
            id: 1,
            agents: ['coder'],
            retry_count: 1,
            blocker_count: 2,
            review_finding_count: 3,
            duration_ms: 1000,
            token_usage: { input: 10, output: 20, cached: 5 },
          },
          {
            id: 2,
            agents: ['tester'],
            review_finding_count: 1,
            duration_ms: 500,
          },
        ],
      },
      workspace
    );
    const perf = handleGetAgentPerformance({}, workspace);
    assert.equal(perf.agent_count, 2);
    assert.equal(perf.by_agent.coder.samples, 1);
    assert.equal(perf.by_agent.coder.total_blockers, 2);
    assert.equal(perf.by_agent.coder.avg_review_finding_count, 3);
    assert.equal(perf.by_agent.coder.avg_phase_duration_ms, 1000);
    assert.deepEqual(perf.by_agent.coder.token_usage, {
      input: 10,
      output: 20,
      cached: 5,
    });
    assert.equal(perf.by_agent.tester.avg_phase_duration_ms, 500);
  });

  it('defaults missing fields to zero for legacy archives', () => {
    const workspace = makeWorkspace();
    writeLedger(workspace, {
      schema_version: 1,
      records: [{ session_id: 'old', agent: 'coder', phase_id: 1 }],
    });
    const perf = handleGetAgentPerformance({}, workspace);
    assert.equal(perf.by_agent.coder.samples, 1);
    assert.equal(perf.by_agent.coder.total_blockers, 0);
    assert.equal(perf.by_agent.coder.total_findings, 0);
    assert.equal(perf.by_agent.coder.total_retries, 0);
    assert.equal(perf.by_agent.coder.avg_phase_duration_ms, 0);
    assert.deepEqual(perf.by_agent.coder.token_usage, {
      input: 0,
      output: 0,
      cached: 0,
    });
  });

  it('returns empty priors when the ledger is absent', () => {
    const perf = handleGetAgentPerformance({}, makeWorkspace());
    assert.equal(perf.agent_count, 0);
    assert.deepEqual(perf.by_agent, {});
  });

  it('narrows to a single agent when the agent param is set', () => {
    const workspace = makeWorkspace();
    writeLedger(workspace, {
      schema_version: 1,
      records: [
        { session_id: 's1', agent: 'coder', phase_id: 1, blocker_count: 1 },
        { session_id: 's1', agent: 'tester', phase_id: 2, blocker_count: 9 },
      ],
    });
    const perf = handleGetAgentPerformance({ agent: 'coder' }, workspace);
    assert.deepEqual(Object.keys(perf.by_agent), ['coder']);
    assert.equal(perf.by_agent.coder.total_blockers, 1);
  });
});
