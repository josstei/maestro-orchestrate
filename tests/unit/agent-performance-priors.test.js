'use strict';

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  handleAssessTaskComplexity,
} = require('../../src/mcp/handlers/assess-task-complexity');
const { handleValidatePlan } = require('../../src/mcp/handlers/validate-plan');

const tmpRoots = [];

function makeWorkspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-agent-perf-priors-'));
  tmpRoots.push(dir);
  return dir;
}

function writeLedger(workspace) {
  const file = path.join(
    workspace,
    'docs',
    'maestro',
    'knowledge',
    'agent-performance.json'
  );
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify({
      schema_version: 1,
      records: [
        {
          session_id: 's1',
          agent: 'coder',
          phase_id: 1,
          blocker_count: 2,
          review_finding_count: 1,
          retry_count: 0,
          phase_duration_ms: 800,
          token_usage: { input: 5, output: 6, cached: 0 },
        },
      ],
    })
  );
}

after(() => {
  for (const root of tmpRoots) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('agent-performance priors threading', () => {
  it('assess_task_complexity returns empty agent_priors when no ledger exists', () => {
    const result = handleAssessTaskComplexity({}, makeWorkspace());
    assert.deepEqual(result.agent_priors, {});
  });

  it('assess_task_complexity surfaces priors when the ledger is present', () => {
    const workspace = makeWorkspace();
    writeLedger(workspace);
    const result = handleAssessTaskComplexity({}, workspace);
    assert.equal(result.agent_priors.coder.total_blockers, 2);
  });

  it('validate_plan omits agent_priors when no ledger exists', () => {
    const result = handleValidatePlan(
      { plan: { phases: [] }, task_complexity: 'simple' },
      makeWorkspace()
    );
    assert.equal(result.valid, true);
    assert.equal(Object.prototype.hasOwnProperty.call(result, 'agent_priors'), false);
  });

  it('validate_plan attaches agent_priors when the ledger is present', () => {
    const workspace = makeWorkspace();
    writeLedger(workspace);
    const result = handleValidatePlan(
      { plan: { phases: [] }, task_complexity: 'simple' },
      workspace
    );
    assert.equal(result.agent_priors.coder.total_blockers, 2);
  });
});
