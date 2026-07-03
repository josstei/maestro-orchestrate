'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  createInitializedMcpWorkspace,
  phaseFixture,
} = require('../support/mcp');

async function createCompleteArchive(server, workspace, { session_id, agent, tokens }) {
  await server.callTool(
    'create_session',
    {
      session_id,
      task: `task ${session_id}`,
      task_complexity: 'simple',
      phases: [phaseFixture({ id: 1, name: 'P1', agent })],
    },
    workspace
  );
  await server.callTool(
    'transition_phase',
    {
      session_id,
      completed_phase_id: 1,
      downstream_context: { integration_points: ['x'] },
      token_usage: tokens,
    },
    workspace
  );
  const archived = await server.callTool('archive_session', { session_id }, workspace);
  assert.equal(archived.ok, true, archived.error || '');
}

describe('archive index, search, and cost insights', () => {
  it('lists, searches, and rolls up archived sessions', async () => {
    const { server, workspace } = await createInitializedMcpWorkspace({
      prefix: 'maestro-archive-idx-',
    });

    await createCompleteArchive(server, workspace, {
      session_id: 'ax-1',
      agent: 'coder',
      tokens: { input: 100, output: 40, cached: 10 },
    });
    await createCompleteArchive(server, workspace, {
      session_id: 'ax-2',
      agent: 'tester',
      tokens: { input: 20, output: 8, cached: 2 },
    });

    const list = await server.callTool('list_archived_sessions', {}, workspace);
    assert.equal(list.ok, true, list.error || '');
    assert.equal(list.result.count, 2);
    const ids = list.result.sessions.map((s) => s.session_id);
    assert.ok(ids.includes('ax-1'));
    assert.ok(ids.includes('ax-2'));
    assert.equal(list.result.sessions[0].outcome, 'completed');
    assert.ok(Array.isArray(list.result.sessions[0].agents));

    const byAgent = await server.callTool(
      'search_archived_sessions',
      { agent: 'coder' },
      workspace
    );
    assert.equal(byAgent.ok, true);
    assert.equal(byAgent.result.count, 1);
    assert.equal(byAgent.result.sessions[0].session_id, 'ax-1');

    const byOutcome = await server.callTool(
      'search_archived_sessions',
      { outcome: 'completed' },
      workspace
    );
    assert.equal(byOutcome.result.count, 2);

    const failed = await server.callTool(
      'search_archived_sessions',
      { outcome: 'failed' },
      workspace
    );
    assert.equal(failed.result.count, 0);

    const insights = await server.callTool('get_cost_insights', {}, workspace);
    assert.equal(insights.ok, true, insights.error || '');
    assert.equal(insights.result.session_count, 2);
    assert.equal(insights.result.totals.input, 120);
    assert.equal(insights.result.totals.output, 48);
    assert.equal(insights.result.by_agent.coder.input, 100);
    assert.equal(insights.result.by_agent.tester.input, 20);
    assert.equal(insights.result.by_agent.coder.phases, 1);
    assert.equal(typeof insights.result.latency.avg_phase_duration_ms, 'number');
  });

  it('returns an empty rollup on a workspace with no archives', async () => {
    const { server, workspace } = await createInitializedMcpWorkspace({
      prefix: 'maestro-archive-empty-',
    });

    const list = await server.callTool('list_archived_sessions', {}, workspace);
    assert.equal(list.ok, true);
    assert.equal(list.result.count, 0);

    const insights = await server.callTool('get_cost_insights', {}, workspace);
    assert.equal(insights.ok, true);
    assert.equal(insights.result.session_count, 0);
    assert.deepEqual(insights.result.by_agent, {});
    assert.equal(insights.result.totals.input, 0);
  });
});
