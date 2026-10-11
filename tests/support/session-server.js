'use strict';

const fs = require('node:fs');
const path = require('node:path');

const markdownState = require('../../src/core/markdown-state');
const { createServer } = require('../../src/mcp/core/create-server');
const {
  createToolPack: createSessionPack,
} = require('../../src/mcp/tool-packs/session');
const {
  createToolPack: createWorkspacePack,
} = require('../../src/mcp/tool-packs/workspace');

/**
 * Creates an MCP server with the workspace and session tool packs mounted.
 *
 * @returns {{ getToolSchemas: () => object[], callTool: Function }} The composed server
 */
function createSessionServer() {
  return createServer({ toolPacks: [createWorkspacePack, createSessionPack] });
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
 * Reads and parses the JSON frontmatter of a workspace's active session file
 * at `docs/maestro/state/active-session.md`.
 *
 * @param {string} workspace - Absolute path of a workspace holding an active session
 * @returns {Object} The parsed session state
 */
function readSessionState(workspace) {
  const sessionPath = path.join(workspace, 'docs', 'maestro', 'state', 'active-session.md');
  return markdownState.parse(fs.readFileSync(sessionPath, 'utf8')).data;
}

module.exports = {
  createInitializedSessionServer,
  createSessionServer,
  readSessionState,
};
