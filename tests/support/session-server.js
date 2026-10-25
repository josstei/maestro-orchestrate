'use strict';

const { createServer } = require('../../src/mcp/core/create-server');
const {
  createToolPack: createSessionPack,
} = require('../../src/mcp/tool-packs/session');
const {
  createToolPack: createWorkspacePack,
} = require('../../src/mcp/tool-packs/workspace');

/**
 * Creates an MCP server with the given tool packs mounted under a runtime
 * config that names only the runtime.
 *
 * @param {Array<Function|Object>} packs - Tool packs (or pack factories) to mount, in order
 * @param {string} [runtime='codex'] - Runtime name for the server's runtime config
 * @returns {{ getToolSchemas: () => object[], callTool: Function }} The composed server
 */
function packServer(packs, runtime = 'codex') {
  return createServer({ runtimeConfig: { name: runtime }, toolPacks: packs });
}

/**
 * Creates a workspace-and-session server and initializes the given workspace
 * on it. The `initialize_workspace` outcome is not inspected.
 *
 * @param {string} workspace - Absolute path of the workspace to initialize
 * @returns {Promise<{ getToolSchemas: () => object[], callTool: Function }>} The initialized server
 */
async function createInitializedSessionServer(workspace) {
  const server = packServer([createWorkspacePack, createSessionPack]);
  await server.callTool('initialize_workspace', { workspace_path: workspace }, workspace);
  return server;
}

/**
 * Enters the design gate for `sessionId` and records its approval. The
 * `enter_design_gate` outcome is not inspected.
 *
 * @param {{ callTool: Function }} server - Server with the session tool pack mounted
 * @param {string} workspace - Absolute path of the workspace
 * @param {string} sessionId - Session whose gate to enter and approve
 * @param {Object} design - The record_design_approval document fields: either
 *   `{ design_document_path }` or `{ design_document_content, design_document_filename }`
 * @returns {Promise<Object>} The `record_design_approval` outcome
 */
async function approveDesignGate(server, workspace, sessionId, design) {
  await server.callTool('enter_design_gate', { session_id: sessionId }, workspace);
  return server.callTool('record_design_approval', { session_id: sessionId, ...design }, workspace);
}

/**
 * Builds a sequential coder phase with no dependencies. Each call returns a
 * fresh phase object.
 *
 * @param {number|string} id - The phase id
 * @param {Object} [overrides={}] - Phase fields to add or replace (e.g. `files`, `blocked_by`)
 * @returns {Object} A phase for a create_session or validate_plan payload
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
 *
 * @param {string} sessionId - The session_id to create
 * @param {Object} [overrides={}] - create_session params to add or replace (e.g. `phases`)
 * @returns {Object} The create_session params
 */
function sessionParams(sessionId, overrides = {}) {
  return { session_id: sessionId, task: 'Test session', phases: singlePhase([]), ...overrides };
}

module.exports = {
  approveDesignGate,
  createInitializedSessionServer,
  packServer,
  phase,
  sessionParams,
  singlePhase,
};
