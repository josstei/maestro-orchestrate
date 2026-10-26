'use strict';

const { createServer } = require('../../src/mcp/core/create-server');
const {
  createToolPack: createSessionPack,
} = require('../../src/mcp/tool-packs/session');
const {
  createToolPack: createWorkspacePack,
} = require('../../src/mcp/tool-packs/workspace');
const { makeTempDir } = require('./fs');

/**
 * Creates an MCP server with the given tool packs mounted under a runtime
 * config that names only the runtime.
 */
function packServer(packs, runtime = 'codex') {
  return createServer({ runtimeConfig: { name: runtime }, toolPacks: packs });
}

/** An initialized workspace bound to a workspace-and-session server, so calls need not pass it. */
class SessionWorkspace {
  /** Initializes `dir` (a fresh temp dir by default); the outcome is not inspected. */
  static async create(dir = makeTempDir('maestro-session-')) {
    const workspace = new SessionWorkspace(dir, packServer([createWorkspacePack, createSessionPack]));
    await workspace.call('initialize_workspace', { workspace_path: dir });
    return workspace;
  }

  constructor(dir, server) {
    this.dir = dir;
    this.server = server;
  }

  call(tool, params) {
    return this.server.callTool(tool, params, this.dir);
  }

  createSession(sessionId, overrides) {
    return this.call('create_session', sessionParams(sessionId, overrides));
  }

  enterGate(sessionId) {
    return this.call('enter_design_gate', { session_id: sessionId });
  }

  /** Enters the gate and returns the record_design_approval outcome for `design`. */
  async approve(sessionId, design) {
    await this.enterGate(sessionId);
    return this.call('record_design_approval', { session_id: sessionId, ...design });
  }

  /** Completes `phaseId` with no files and an empty handoff unless `handoff` supplies them. */
  transition(sessionId, phaseId, handoff = {}) {
    return this.call('transition_phase', {
      session_id: sessionId, completed_phase_id: phaseId,
      files_created: [], files_modified: [], downstream_context: {}, ...handoff,
    });
  }
}

/** The server of SessionWorkspace.create(workspace). */
async function createInitializedSessionServer(workspace) {
  return (await SessionWorkspace.create(workspace)).server;
}

/** SessionWorkspace#approve for a bare server and workspace. */
function approveDesignGate(server, workspace, sessionId, design) {
  return new SessionWorkspace(workspace, server).approve(sessionId, design);
}

/**
 * Builds a sequential coder phase with no dependencies. Each call returns a
 * fresh phase object.
 */
function phase(id, overrides = {}) {
  return { id, name: `P${id}`, agent: 'coder', parallel: false, blocked_by: [], ...overrides };
}

/**
 * Builds a one-phase `phases` payload for create_session. Each call returns a
 * fresh array and phase object.
 *
 * @param {string[]} files - The phase's planned files
 * @param {Object} [overrides={}] - Phase fields to replace (e.g. `name`)
 * @returns {Object[]} A single-element phases array
 */
function singlePhase(files, overrides = {}) {
  return [phase(1, { files, ...overrides })];
}

/**
 * Builds create_session params for `sessionId` with a placeholder task and a
 * single phase that plans no files.
 */
function sessionParams(sessionId, overrides = {}) {
  return { session_id: sessionId, task: 'Test session', phases: singlePhase([]), ...overrides };
}

module.exports = {
  SessionWorkspace,
  approveDesignGate,
  createInitializedSessionServer,
  packServer,
  phase,
  sessionParams,
  singlePhase,
};
