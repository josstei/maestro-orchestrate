const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createServer } = require('../../src/mcp/core/create-server');
const { createToolPack } = require('../../src/mcp/tool-packs/session');
const { ensureWorkspace } = require('../../src/state/session-state');

function readSessionFrontmatter(projectRoot) {
  const content = fs.readFileSync(
    path.join(projectRoot, 'docs/maestro/state/active-session.md'),
    'utf8'
  );
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  return JSON.parse(match[1]);
}

describe('session tool pack', () => {
  it('registers the session lifecycle tools through the kernel', () => {
    const server = createServer({
      runtimeConfig: { name: 'codex' },
      services: {},
      toolPacks: [createToolPack],
    });

    assert.deepEqual(
      server.getToolSchemas().map((schema) => schema.name),
      [
        'create_session',
        'get_session_status',
        'update_session',
        'transition_phase',
        'archive_session',
      ]
    );
  });

  it('creates, updates, and transitions session state on disk', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-session-'));
    ensureWorkspace('docs/maestro', projectRoot);

    const server = createServer({
      runtimeConfig: { name: 'codex' },
      services: {},
      toolPacks: [createToolPack],
    });

    const createResult = await server.callTool(
      'create_session',
      {
        session_id: 'test-session',
        task: 'Test session lifecycle',
        task_complexity: 'complex',
        design_document: 'docs/maestro/plans/design.md',
        implementation_plan: 'docs/maestro/plans/plan.md',
        phases: [
          { id: 1, name: 'Phase 1', agent: 'coder', blocked_by: [] },
          { id: 2, name: 'Phase 2', agent: 'coder', blocked_by: [1] },
        ],
      },
      projectRoot
    );

    assert.equal(createResult.ok, true);

    const updateResult = await server.callTool(
      'update_session',
      {
        session_id: 'test-session',
        execution_mode: 'sequential',
        execution_backend: 'native',
      },
      projectRoot
    );

    assert.equal(updateResult.ok, true);

    const transitionResult = await server.callTool(
      'transition_phase',
      {
        session_id: 'test-session',
        completed_phase_id: 1,
        next_phase_id: 2,
        files_created: ['src/generated.js'],
        files_modified: ['src/existing.js'],
        downstream_context: {
          key_interfaces_introduced: ['createServer(options)'],
          patterns_established: ['pack-based composition'],
          integration_points: ['session pack'],
          assumptions: ['phases are sequential'],
          warnings: [],
        },
      },
      projectRoot
    );

    assert.equal(transitionResult.ok, true);
    assert.deepEqual(transitionResult.result.session_state_summary.completed_phases, [
      1,
    ]);

    const sessionState = readSessionFrontmatter(projectRoot);
    assert.equal(sessionState.execution_mode, 'sequential');
    assert.equal(sessionState.current_phase, 2);
    assert.deepEqual(sessionState.phases[0].files_created, ['src/generated.js']);
    assert.deepEqual(sessionState.phases[0].files_modified, ['src/existing.js']);
    assert.equal(sessionState.phases[1].status, 'in_progress');
  });

  it('archives the active session and associated plan files', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-archive-'));
    ensureWorkspace('docs/maestro', projectRoot);

    const designPath = path.join(projectRoot, 'docs/maestro/plans/design.md');
    const planPath = path.join(projectRoot, 'docs/maestro/plans/plan.md');
    fs.writeFileSync(designPath, '# design\n');
    fs.writeFileSync(planPath, '# plan\n');

    const server = createServer({
      runtimeConfig: { name: 'codex' },
      services: {},
      toolPacks: [createToolPack],
    });

    await server.callTool(
      'create_session',
      {
        session_id: 'archive-session',
        task: 'Archive test',
        design_document: 'docs/maestro/plans/design.md',
        implementation_plan: 'docs/maestro/plans/plan.md',
        phases: [{ id: 1, name: 'Phase 1', agent: 'coder', blocked_by: [] }],
      },
      projectRoot
    );

    const archiveResult = await server.callTool(
      'archive_session',
      { session_id: 'archive-session' },
      projectRoot
    );

    assert.equal(archiveResult.ok, true);
    assert.equal(
      fs.existsSync(path.join(projectRoot, 'docs/maestro/state/active-session.md')),
      false
    );
    assert.equal(
      fs.existsSync(
        path.join(
          projectRoot,
          'docs/maestro/state/archive/archive-session.md'
        )
      ),
      true
    );
    assert.equal(
      fs.existsSync(path.join(projectRoot, 'docs/maestro/plans/archive/design.md')),
      true
    );
    assert.equal(
      fs.existsSync(path.join(projectRoot, 'docs/maestro/plans/archive/plan.md')),
      true
    );
  });
});
