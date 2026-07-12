import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createInitializedMcpWorkspace, phaseFixture, readSessionFrontmatter } from '../support/mcp.js';

describe('per-agent cost attribution', () => {
  it('populates by_agent and phase timing on transition_phase', async (t) => {
    const { server, workspace } = await createInitializedMcpWorkspace({
      prefix: 'maestro-cost-attr-',
      testContext: t,
    });

    await server.callTool(
      'create_session',
      {
        session_id: 'ca-1',
        task: 'cost attribution',
        task_complexity: 'simple',
        phases: [phaseFixture({ id: 1, name: 'P1', agent: 'coder' })],
      },
      workspace
    );

    const transition = await server.callTool(
      'transition_phase',
      {
        session_id: 'ca-1',
        completed_phase_id: 1,
        downstream_context: { integration_points: ['src/x.js'] },
        token_usage: { input: 100, output: 50, cached: 10 },
      },
      workspace
    );
    assert.equal(transition.ok, true, transition.error || '');

    const state = readSessionFrontmatter(workspace);
    assert.equal(state.token_usage.total_input, 100);
    assert.equal(state.token_usage.total_output, 50);
    assert.equal(state.token_usage.total_cached, 10);

    assert.ok(
      state.token_usage.by_agent.coder,
      'by_agent.coder must be populated'
    );
    assert.equal(state.token_usage.by_agent.coder.input, 100);
    assert.equal(state.token_usage.by_agent.coder.output, 50);
    assert.equal(state.token_usage.by_agent.coder.cached, 10);
    assert.equal(state.token_usage.by_agent.coder.phases, 1);
    assert.equal(typeof state.token_usage.by_agent.coder.duration_ms, 'number');
    assert.ok(state.token_usage.by_agent.coder.duration_ms >= 0);

    const phase = state.phases.find((p) => p.id === 1);
    assert.equal(typeof phase.duration_ms, 'number');
    assert.ok(phase.duration_ms >= 0);
    assert.deepEqual(phase.token_usage, { input: 100, output: 50, cached: 10 });
  });
});
