'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createServer } = require('../../src/mcp/core/create-server');
const {
  createToolPack: createWorkspacePack,
} = require('../../src/mcp/tool-packs/workspace');
const {
  createToolPack: createSessionPack,
} = require('../../src/mcp/tool-packs/session');

function createServerForWorkspace() {
  return createServer({
    runtimeConfig: { name: 'codex' },
    services: {},
    toolPacks: [createWorkspacePack, createSessionPack],
  });
}

function statePath(workspace) {
  return path.join(workspace, 'docs', 'maestro', 'state', 'active-session.md');
}

function readState(workspace) {
  const raw = fs.readFileSync(statePath(workspace), 'utf8');
  return JSON.parse(raw.split('---')[1].trim());
}

function writeState(workspace, state, rawTemplate) {
  const parts = rawTemplate.split('---');
  const rewritten = `---\n${JSON.stringify(state, null, 2)}\n---${parts.slice(2).join('---')}`;
  fs.writeFileSync(statePath(workspace), rewritten);
}

async function prepareSession({ phaseAgents = null } = {}) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-tel-'));
  const server = createServerForWorkspace();
  await server.callTool(
    'initialize_workspace',
    { workspace_path: workspace },
    workspace
  );
  await server.callTool(
    'create_session',
    {
      session_id: 'tel-1',
      task: 'telemetry attribution',
      task_complexity: 'simple',
      phases: [
        {
          id: 1,
          name: 'P1',
          agent: 'coder',
          parallel: false,
          blocked_by: [],
          files: ['x'],
        },
      ],
    },
    workspace
  );

  if (phaseAgents) {
    const raw = fs.readFileSync(statePath(workspace), 'utf8');
    const state = JSON.parse(raw.split('---')[1].trim());
    state.phases[0].agents = phaseAgents;
    writeState(workspace, state, raw);
  }

  return { server, workspace };
}

describe('transition_phase token_usage attribution', () => {
  it('accumulates totals and per-agent splits when agent_name is a single string', async () => {
    const { server, workspace } = await prepareSession();

    const result = await server.callTool(
      'transition_phase',
      {
        session_id: 'tel-1',
        completed_phase_id: 1,
        files_created: ['x.js'],
        downstream_context: { integration_points: ['x.js'] },
        token_usage: { input: 100, output: 50, cached: 10 },
        agent_name: 'coder',
      },
      workspace
    );

    assert.equal(result.ok, true);
    const state = readState(workspace);
    assert.equal(state.token_usage.total_input, 100);
    assert.equal(state.token_usage.total_output, 50);
    assert.equal(state.token_usage.total_cached, 10);
    assert.deepEqual(state.token_usage.by_agent.coder, {
      input: 100,
      output: 50,
      cached: 10,
    });
  });

  it('splits usage equally across agents when agent_name is an array', async () => {
    const { server, workspace } = await prepareSession();

    const result = await server.callTool(
      'transition_phase',
      {
        session_id: 'tel-1',
        completed_phase_id: 1,
        files_created: ['x.js'],
        downstream_context: { integration_points: ['x.js'] },
        token_usage: { input: 100, output: 50, cached: 10 },
        agent_name: ['coder', 'tester'],
      },
      workspace
    );

    assert.equal(result.ok, true);
    const state = readState(workspace);
    assert.equal(state.token_usage.total_input, 100);
    assert.equal(state.token_usage.by_agent.coder.input, 50);
    assert.equal(state.token_usage.by_agent.tester.input, 50);
    assert.equal(state.token_usage.by_agent.coder.output, 25);
    assert.equal(state.token_usage.by_agent.tester.output, 25);
    assert.equal(state.token_usage.by_agent.coder.cached, 5);
    assert.equal(state.token_usage.by_agent.tester.cached, 5);
  });

  it('falls back to phase.agents when agent_name is omitted', async () => {
    const { server, workspace } = await prepareSession({
      phaseAgents: ['coder', 'tester'],
    });

    const result = await server.callTool(
      'transition_phase',
      {
        session_id: 'tel-1',
        completed_phase_id: 1,
        files_created: ['x.js'],
        downstream_context: { integration_points: ['x.js'] },
        token_usage: { input: 200, output: 100, cached: 20 },
      },
      workspace
    );

    assert.equal(result.ok, true);
    const state = readState(workspace);
    assert.equal(state.token_usage.by_agent.coder.input, 100);
    assert.equal(state.token_usage.by_agent.tester.input, 100);
  });

  it('falls back to phase.agents when agent_name is an empty array (regression guard)', async () => {
    const { server, workspace } = await prepareSession();

    const result = await server.callTool(
      'transition_phase',
      {
        session_id: 'tel-1',
        completed_phase_id: 1,
        files_created: ['x.js'],
        downstream_context: { integration_points: ['x.js'] },
        token_usage: { input: 100, output: 50, cached: 10 },
        agent_name: [],
      },
      workspace
    );

    assert.equal(result.ok, true);
    const state = readState(workspace);
    assert.equal(state.token_usage.by_agent.coder.input, 100);
    assert.equal(state.token_usage.total_input, 100);
  });

  it('falls back to "unknown" agent when no attribution is available', async () => {
    const { server, workspace } = await prepareSession({ phaseAgents: [] });

    const result = await server.callTool(
      'transition_phase',
      {
        session_id: 'tel-1',
        completed_phase_id: 1,
        files_created: ['x.js'],
        downstream_context: { integration_points: ['x.js'] },
        token_usage: { input: 100, output: 50, cached: 10 },
      },
      workspace
    );

    assert.equal(result.ok, true);
    const state = readState(workspace);
    assert.deepEqual(state.token_usage.by_agent.unknown, {
      input: 100,
      output: 50,
      cached: 10,
    });
  });

  it('tolerates legacy session missing the by_agent field (back-compat)', async () => {
    const { server, workspace } = await prepareSession();

    const raw = fs.readFileSync(statePath(workspace), 'utf8');
    const state = JSON.parse(raw.split('---')[1].trim());
    state.token_usage.by_agent = null;
    writeState(workspace, state, raw);

    const result = await server.callTool(
      'transition_phase',
      {
        session_id: 'tel-1',
        completed_phase_id: 1,
        files_created: ['y.js'],
        downstream_context: { integration_points: ['y.js'] },
        token_usage: { input: 10, output: 5, cached: 0 },
        agent_name: 'coder',
      },
      workspace
    );

    assert.equal(result.ok, true);
    const finalState = readState(workspace);
    assert.equal(finalState.token_usage.by_agent.coder.input, 10);
  });

  it('tolerates legacy session missing the entire token_usage block (back-compat)', async () => {
    const { server, workspace } = await prepareSession();

    const raw = fs.readFileSync(statePath(workspace), 'utf8');
    const state = JSON.parse(raw.split('---')[1].trim());
    delete state.token_usage;
    writeState(workspace, state, raw);

    const result = await server.callTool(
      'transition_phase',
      {
        session_id: 'tel-1',
        completed_phase_id: 1,
        files_created: ['y.js'],
        downstream_context: { integration_points: ['y.js'] },
        token_usage: { input: 25, output: 5, cached: 0 },
        agent_name: 'coder',
      },
      workspace
    );

    assert.equal(result.ok, true);
    const finalState = readState(workspace);
    assert.equal(finalState.token_usage.total_input, 25);
    assert.equal(finalState.token_usage.by_agent.coder.input, 25);
  });

  it('tolerates by_agent that is an array (regression guard for malformed state)', async () => {
    const { server, workspace } = await prepareSession();

    const raw = fs.readFileSync(statePath(workspace), 'utf8');
    const state = JSON.parse(raw.split('---')[1].trim());
    state.token_usage.by_agent = ['malformed'];
    writeState(workspace, state, raw);

    const result = await server.callTool(
      'transition_phase',
      {
        session_id: 'tel-1',
        completed_phase_id: 1,
        files_created: ['z.js'],
        downstream_context: { integration_points: ['z.js'] },
        token_usage: { input: 60, output: 30, cached: 6 },
        agent_name: 'coder',
      },
      workspace
    );

    assert.equal(result.ok, true);
    const finalState = readState(workspace);
    assert.equal(Array.isArray(finalState.token_usage.by_agent), false);
    assert.equal(finalState.token_usage.by_agent.coder.input, 60);
  });

  it('does not alter token_usage when params.token_usage is omitted', async () => {
    const { server, workspace } = await prepareSession();

    const result = await server.callTool(
      'transition_phase',
      {
        session_id: 'tel-1',
        completed_phase_id: 1,
        files_created: ['x.js'],
        downstream_context: { integration_points: ['x.js'] },
      },
      workspace
    );

    assert.equal(result.ok, true);
    const state = readState(workspace);
    assert.equal(state.token_usage.total_input, 0);
    assert.deepEqual(state.token_usage.by_agent, {});
  });

  it('multi-agent split uses Math.floor and may underattribute by up to (n-1) tokens', async () => {
    const { server, workspace } = await prepareSession();

    const result = await server.callTool(
      'transition_phase',
      {
        session_id: 'tel-1',
        completed_phase_id: 1,
        files_created: ['x.js'],
        downstream_context: { integration_points: ['x.js'] },
        token_usage: { input: 7, output: 5, cached: 1 },
        agent_name: ['coder', 'tester', 'reviewer'],
      },
      workspace
    );

    assert.equal(result.ok, true);
    const state = readState(workspace);
    assert.equal(state.token_usage.total_input, 7);
    const sumInput =
      state.token_usage.by_agent.coder.input +
      state.token_usage.by_agent.tester.input +
      state.token_usage.by_agent.reviewer.input;
    assert.equal(sumInput, 6, 'floor(7/3)*3 = 6, total_input still records 7');
  });
});
