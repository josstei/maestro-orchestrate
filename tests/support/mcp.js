import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from '../../src/mcp/core/create-server.js';
import { createToolPack as createWorkspacePack } from '../../src/mcp/tool-packs/workspace/index.js';
import { createToolPack as createSessionPack } from '../../src/mcp/tool-packs/session/index.js';
import { createToolPack as createContentPack } from '../../src/mcp/tool-packs/content/index.js';
import { ensureWorkspace } from '../../src/state/session-state.js';
const DEFAULT_STATE_DIR = 'docs/maestro';

function makeTempWorkspace(prefix = 'maestro-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function ensureMaestroWorkspace(workspace) {
  ensureWorkspace(DEFAULT_STATE_DIR, workspace);
  return workspace;
}

function buildMcpServer({
  runtime = 'codex',
  runtimeConfig,
  services = {},
  toolPacks = [createWorkspacePack, createSessionPack],
} = {}) {
  return createServer({
    runtimeConfig: runtimeConfig || { name: runtime },
    services,
    toolPacks,
  });
}

async function initializeWorkspace(server, workspace) {
  return server.callTool(
    'initialize_workspace',
    { workspace_path: workspace },
    workspace
  );
}

async function createInitializedMcpWorkspace(options = {}) {
  const { prefix = 'maestro-test-', ...serverOptions } = options;
  const workspace = makeTempWorkspace(prefix);
  const server = buildMcpServer(serverOptions);
  const init = await initializeWorkspace(server, workspace);

  return { workspace, server, init };
}

function writeWorkspaceFile(workspace, relativePath, content) {
  const filePath = path.join(workspace, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  return filePath;
}

function readJsonFrontmatter(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const match = content.match(/^---\n([\s\S]*?)\n---/);

  if (!match) {
    throw new Error(`No JSON frontmatter found in ${filePath}`);
  }

  return JSON.parse(match[1]);
}

function readSessionFrontmatter(workspace) {
  return readJsonFrontmatter(
    path.join(workspace, DEFAULT_STATE_DIR, 'state', 'active-session.md')
  );
}

function phaseFixture(overrides = {}) {
  return {
    id: 1,
    name: 'Phase 1',
    agent: 'coder',
    parallel: false,
    blocked_by: [],
    ...overrides,
  };
}

export { buildMcpServer, createContentPack, createInitializedMcpWorkspace, createSessionPack, createWorkspacePack, ensureMaestroWorkspace, initializeWorkspace, makeTempWorkspace, phaseFixture, readJsonFrontmatter, readSessionFrontmatter, writeWorkspaceFile };
