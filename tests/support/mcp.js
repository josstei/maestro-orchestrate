import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../../src/mcp/server/create-mcp-server.js';
import { createMaestroToolRegistry } from '../../src/mcp/tool-packs/contracts.js';
import { registerWorkspacePack } from '../../src/mcp/tool-packs/workspace/index.js';
import { registerSessionPack } from '../../src/mcp/tool-packs/session/index.js';
import { registerContentPack } from '../../src/mcp/tool-packs/content/index.js';
import { ensureWorkspace } from '../../src/state/session-state.js';
const DEFAULT_STATE_DIR = 'docs/maestro';

function makeTempWorkspace(prefix = 'maestro-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function ensureMaestroWorkspace(workspace) {
  ensureWorkspace(DEFAULT_STATE_DIR, workspace);
  return workspace;
}

/**
 * Reconstruct maestro's `ToolOutcome` shape (see
 * `src/mcp/server/tool-outcome.js`) from an SDK `CallToolResult`. A resolved
 * `isError` result whose text parses as maestro's JSON envelope (a thrown
 * `MaestroError`, normalized by the tool pipeline) keeps its `code` and
 * `recovery_hint`; a resolved `isError` result whose text is the SDK's own
 * plain-text `McpError` message (a zod arg-shape validation failure, raised
 * BEFORE the tool callback ever runs) is surfaced as a shape-error outcome
 * with no packed envelope, per the shape-vs-domain error classification.
 *
 * @param {{content: Array<{type: string, text?: string}>, isError?: boolean}} response
 * @returns {{ok: true, result: unknown} | {ok: false, error: string, code?: string, recovery_hint: string|null, details?: unknown}}
 */
function parseCallToolResult(response) {
  const block = response && Array.isArray(response.content) ? response.content[0] : null;
  const text = block && typeof block.text === 'string' ? block.text : '';
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }

  if (!response || !response.isError) {
    return { ok: true, result: parsed };
  }

  if (parsed && typeof parsed === 'object' && typeof parsed.error === 'string') {
    const outcome = { ok: false, error: parsed.error, recovery_hint: parsed.recovery_hint ?? null };
    if (parsed.code) outcome.code = parsed.code;
    if (parsed.details !== undefined) outcome.details = parsed.details;
    return outcome;
  }

  return { ok: false, error: text, code: 'INVALID_PARAMS', recovery_hint: null, shape: true };
}

/**
 * Build a live SDK-backed test server: an `McpServer` wired with the given
 * tool packs (defineTool authoring), connected to a real `Client` over the
 * SDK's `InMemoryTransport` — so zod argument validation runs in the tested
 * path exactly as it does in production (see `../../src/mcp/maestro-server.js`).
 * `projectRoot` is threaded through the SAME injected-resolver seam as the
 * live server: `initialize_workspace`'s pipeline post-call sets it, and every
 * later call on this instance resolves it — never `process.cwd()`/ambient env.
 *
 * @param {{runtime?: string, runtimeConfig?: object, services?: object, toolPacks?: Array<Function>}} options
 */
async function buildMcpServer({
  runtime = 'codex',
  runtimeConfig,
  services = {},
  toolPacks = [registerWorkspacePack, registerSessionPack],
} = {}) {
  const server = createMcpServer();
  const registry = createMaestroToolRegistry();
  let workspacePath = null;

  const packOptions = {
    server,
    registry,
    runtimeConfig: runtimeConfig || { name: runtime },
    services,
    getProjectRoot: () => workspacePath,
    onInitializeWorkspace(result) {
      if (result && result.success && result.workspace_path) {
        workspacePath = result.workspace_path;
      }
    },
  };

  for (const registerPack of toolPacks) {
    registerPack(packOptions);
  }

  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'maestro-test-client', version: '0.0.0' }, { capabilities: {} });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  return {
    server,
    client,
    /**
     * @param {string} name
     * @param {object} [args]
     * @param {string} [projectRootOverride] - test-only convenience: sets the
     *   harness's tracked workspace root directly, for suites that exercise a
     *   single pack in isolation (no `initialize_workspace` tool registered).
     *   Sticky like a real `initialize_workspace` call — never a per-call
     *   ambient override read fresh each time.
     */
    async callTool(name, args = {}, projectRootOverride) {
      if (projectRootOverride) {
        workspacePath = projectRootOverride;
      }
      const response = await client.callTool({ name, arguments: args || {} });
      return parseCallToolResult(response);
    },
    async getToolSchemas() {
      const { tools } = await client.listTools();
      return tools;
    },
    async close() {
      await client.close();
      await server.close();
    },
  };
}

async function initializeWorkspace(server, workspace) {
  return server.callTool('initialize_workspace', { workspace_path: workspace });
}

async function createInitializedMcpWorkspace(options = {}) {
  const { prefix = 'maestro-test-', ...serverOptions } = options;
  const workspace = makeTempWorkspace(prefix);
  const server = await buildMcpServer(serverOptions);
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

export { buildMcpServer, registerContentPack as createContentPack, createInitializedMcpWorkspace, registerSessionPack as createSessionPack, registerWorkspacePack as createWorkspacePack, ensureMaestroWorkspace, initializeWorkspace, makeTempWorkspace, phaseFixture, readJsonFrontmatter, readSessionFrontmatter, writeWorkspaceFile };
