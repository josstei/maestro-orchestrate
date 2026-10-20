'use strict';

const { createServer } = require('../../src/mcp/create-server');
const { createProjectRootCache } = require('../../src/mcp/project-root-cache');
const { tools: sessionTools } = require('../../src/mcp/tools/session');
const { tools: workspaceTools } = require('../../src/mcp/tools/workspace');
const { getRuntimeConfig } = require('../../src/platforms/runtime-config-map');

/**
 * Creates a Codex MCP server with the workspace and session tools.
 *
 * @returns {{ getToolSchemas: () => object[], callTool: Function }} The server
 */
function createSessionServer() {
  const runtimeConfig = getRuntimeConfig('codex');
  return createServer({
    runtimeConfig,
    workspace: createProjectRootCache({ requestClientRoots: async () => ({}) }),
    tools: [...workspaceTools, ...sessionTools],
  });
}

/**
 * Creates a workspace-and-session server and initializes the given workspace
 * on it. The `initialize_workspace` outcome is not inspected.
 *
 * @param {string} workspace - Absolute path of the workspace to initialize
 * @returns {Promise<{ getToolSchemas: () => object[], callTool: Function }>} The initialized server
 */
async function createInitializedSessionServer(workspace) {
  const server = createSessionServer();
  await server.callTool('initialize_workspace', { workspace_path: workspace }, workspace);
  return server;
}

/**
 * Enters the design gate for `sessionId` and records its approval. The
 * `enter_design_gate` outcome is not inspected.
 *
 * @param {{ callTool: Function }} server - Server with the session tools
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
 * Builds a one-phase `phases` payload for create_session. Each call returns a
 * fresh array and phase object.
 *
 * @param {string[]} files - The phase's planned files
 * @param {Object} [overrides={}] - Phase fields to replace (e.g. `name`)
 * @returns {Object[]} A single-element phases array
 */
function singlePhase(files, overrides = {}) {
  return [{ id: 1, name: 'P1', agent: 'coder', parallel: false, blocked_by: [], files, ...overrides }];
}

module.exports = {
  approveDesignGate,
  createInitializedSessionServer,
  createSessionServer,
  singlePhase,
};
