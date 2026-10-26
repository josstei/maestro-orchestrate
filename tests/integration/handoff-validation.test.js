'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { makeTempDir } = require('../support/fs');
const { readSessionState } = require('../support/session-file');
const {
  createInitializedSessionServer,
  sessionParams,
  singlePhase,
} = require('../support/session-server');

// Each row completes phase 1 of a fresh 'hv-1' session with its
// downstream_context; `check` runs the row's extra assertions.
const cases = [
  {
    name: 'rejects files with empty downstream_context and accepts array payload on retry',
    downstream_context: {},
    ok: false,
    code: 'HANDOFF_INCOMPLETE',
    async check(outcome, { complete }) {
      assert.match(outcome.error || '', /downstream_context is empty after normalization/i);
      assert.equal((await complete({ integration_points: ['src/foo.js'] })).ok, true);
    },
  },
  {
    name: 'accepts string-valued downstream_context per the agent-base-protocol template',
    downstream_context: {
      integration_points:
        'styles.css contains the root variables and base layout that subsequent phases should extend.',
      patterns_established: 'Full-viewport flexbox centering with CSS root variables.',
      assumptions: 'The central container is the primary target for all animations.',
      key_interfaces_introduced: 'none',
      warnings: 'none',
    },
    ok: true,
    check(outcome, { workspace }) {
      const phase = readSessionState(workspace).phases.find((candidate) => candidate.id === 1);
      assert.deepEqual(phase.downstream_context.integration_points, [
        'styles.css contains the root variables and base layout that subsequent phases should extend.',
      ]);
      assert.deepEqual(phase.downstream_context.patterns_established, [
        'Full-viewport flexbox centering with CSS root variables.',
      ]);
      assert.deepEqual(phase.downstream_context.key_interfaces_introduced, []);
      assert.deepEqual(phase.downstream_context.warnings, []);
    },
  },
  {
    name: 'rejects downstream_context whose fields are all "none" even though the object is non-empty',
    downstream_context: {
      integration_points: 'none',
      patterns_established: 'N/A',
      assumptions: '',
      key_interfaces_introduced: 'none',
      warnings: 'none',
    },
    ok: false,
    code: 'HANDOFF_INCOMPLETE',
    check(outcome) {
      assert.ok(
        outcome.details && outcome.details.received_downstream_context,
        'error details should echo the received payload for debugging'
      );
    },
  },
  {
    name: 'drops unknown (non-canonical) keys and normalizes case-mismatched inputs to empty',
    downstream_context: {
      IntegrationPoints: 'PascalCase is not canonical',
      summary: 'neither is summary',
    },
    ok: false,
    code: 'HANDOFF_INCOMPLETE',
  },
];

describe('handoff validation', () => {
  for (const { name, downstream_context, ok, code, check } of cases) {
    it(name, async () => {
      const workspace = makeTempDir('maestro-hv-');
      const server = await createInitializedSessionServer(workspace);
      await server.callTool('create_session', sessionParams('hv-1', { phases: singlePhase(['x']) }), workspace);
      const complete = (context) => server.callTool(
        'transition_phase',
        { session_id: 'hv-1', completed_phase_id: 1, files_created: ['src/foo.js'], downstream_context: context },
        workspace
      );

      const outcome = await complete(downstream_context);
      assert.equal(outcome.ok, ok, outcome.error);
      if (code) assert.equal(outcome.code, code);
      await check?.(outcome, { complete, workspace });
    });
  }
});
