import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PlanSchema } from '../../dist/src/mcp/contracts/plan-schema.js';
import {
  createInitializedMcpWorkspace,
  readSessionFrontmatter,
} from '../support/mcp.js';

describe('canonical plan contract roundtrip', () => {
  it('passes a validated extensible plan directly into create_session', async (t) => {
    const { workspace, server } = await createInitializedMcpWorkspace({
      prefix: 'maestro-canonical-plan-rt-',
      testContext: t,
    });
    const plan = PlanSchema.parse({
      planning_extension: { retained: true },
      phases: [
        {
          id: 'design',
          name: 'Design',
          agent: 'technical-writer',
          parallel: false,
          blocked_by: [],
          files: ['docs/design.md'],
          phase_extension: 'retained',
        },
        {
          id: 'build',
          name: 'Build',
          agent: 'coder',
          parallel: false,
          blocked_by: ['design'],
          files: ['src/build.ts'],
        },
      ],
    });

    const validated = await server.callTool(
      'validate_plan',
      { plan, task_complexity: 'simple' },
      workspace
    );
    assert.equal(validated.ok, true, validated.error || '');
    assert.equal(validated.result.valid, true);

    const created = await server.callTool(
      'create_session',
      {
        session_id: 'canonical-plan-roundtrip',
        task: 'canonical plan roundtrip',
        task_complexity: 'simple',
        phases: plan.phases,
      },
      workspace
    );
    assert.equal(created.ok, true, created.error || '');

    const state = readSessionFrontmatter(workspace);
    assert.deepEqual(state.phases.map((phase) => phase.id), ['design', 'build']);
    assert.deepEqual(state.phases[0].planned_files, ['docs/design.md']);
    assert.deepEqual(state.phases[1].blocked_by, ['design']);
  });
});
