import path from 'path';
import { execSync } from 'child_process';
import {
  extractClientRootCandidates,
  isExtensionCachePath,
  isPlaceholderPath,
  normalizeExistingWorkspaceCandidate,
} from './workspace-path.js';
import { MaestroError } from '../lib/errors/index.js';
import type { MaestroErrorOptions } from '../lib/errors/index.js';
import type { ClientRoot } from './workspace-path.js';

class WorkspaceResolutionError extends MaestroError {
  constructor(message: string, { code = 'WORKSPACE_RESOLUTION_FAILED', details = null }: MaestroErrorOptions = {}) {
    super(message, { code, details });
    this.name = 'WorkspaceResolutionError';
  }
}

interface ProjectRootOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly cwd?: string;
  readonly clientRoots?: readonly (string | ClientRoot)[];
}

interface RuntimeWorkspaceConfig {
  readonly env?: {
    readonly workspacePath?: string | null;
  };
}

function resolveGitRoot(baseDir: string): string {
  return execSync('git rev-parse --show-toplevel', {
    cwd: baseDir,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

function resolveExistingRoot(candidate: unknown): string | null {
  const resolvedCandidate = normalizeExistingWorkspaceCandidate(candidate);
  if (!resolvedCandidate) {
    return null;
  }

  try {
    return resolveGitRoot(resolvedCandidate);
  } catch {
    return resolvedCandidate;
  }
}

function resolveProjectRootFromCandidates(candidates: readonly unknown[]): string | null {
  for (const candidate of candidates) {
    const resolvedRoot = resolveExistingRoot(candidate);
    if (resolvedRoot) {
      return resolvedRoot;
    }
  }

  return null;
}

function resolveProjectRootFromEnv(env: NodeJS.ProcessEnv, cwd: string): string {
  const candidates = [
    env.MAESTRO_WORKSPACE_PATH,
    env.CLAUDE_PROJECT_DIR,
    env.PWD,
    env.INIT_CWD,
  ];

  const resolvedRoot = resolveProjectRootFromCandidates(candidates);
  if (resolvedRoot) {
    return resolvedRoot;
  }

  return resolveExistingRoot(cwd) || path.resolve(cwd);
}

function resolveProjectRootForRuntime(
  runtimeConfig: RuntimeWorkspaceConfig = {},
  options: ProjectRootOptions = {}
): string {
  const env = options.env || process.env;
  const cwd = options.cwd || process.cwd();
  const workspaceEnvName =
    runtimeConfig && runtimeConfig.env ? runtimeConfig.env.workspacePath : null;
  const explicitWorkspacePath =
    workspaceEnvName && env[workspaceEnvName] ? env[workspaceEnvName] : null;

  const explicitRoot = resolveExistingRoot(explicitWorkspacePath);
  if (explicitRoot) {
    return explicitRoot;
  }

  const clientRoot = resolveProjectRootFromCandidates(
    extractClientRootCandidates(options.clientRoots)
  );
  if (clientRoot) {
    return clientRoot;
  }

  return resolveProjectRootFromEnv(env, cwd);
}

function resolveProjectRoot(): string {
  return resolveProjectRootFromEnv(process.env, process.cwd());
}

/**
 * Assert that a tool handler was invoked with a resolved workspace root.
 * Used by handlers that cannot function without a workspace (session state,
 * reconciliation, complexity assessment). The dispatcher calls this centrally
 * when `requiresWorkspace` is declared on the tool schema; handlers may also
 * call it directly for defense in depth.
 *
 * @param {string|null|undefined} projectRoot - resolved project root or nullish
 * @param {string} toolName - tool name for the error message
 * @throws {WorkspaceResolutionError} when projectRoot is absent
 */
function requireWorkspaceRoot(projectRoot: string | null | undefined, toolName: string): string {
  if (typeof projectRoot === 'string' && projectRoot.length > 0) {
    return projectRoot;
  }
  throw new WorkspaceResolutionError(
    `${toolName} requires an initialized workspace. Call initialize_workspace(workspace_path=...) first.`,
    { code: 'WORKSPACE_NOT_INITIALIZED', details: { tool_name: toolName } }
  );
}

function requireExplicitWorkspaceRoot({ workspacePath }: { workspacePath?: string } = {}): string {
  if (
    typeof workspacePath !== 'string' ||
    workspacePath.length === 0 ||
    isPlaceholderPath(workspacePath)
  ) {
    throw new WorkspaceResolutionError(
      'initialize_workspace requires an explicit workspace_path. No implicit cwd or env fallback is used.',
      { code: 'WORKSPACE_REQUIRED' }
    );
  }
  const resolved = normalizeExistingWorkspaceCandidate(workspacePath);
  if (!resolved) {
    const missingPath = path.resolve(workspacePath);
    throw new WorkspaceResolutionError(
      `workspace_path does not exist: ${missingPath}`,
      { code: 'WORKSPACE_NOT_FOUND', details: { workspace_path: missingPath } }
    );
  }
  if (isExtensionCachePath(resolved)) {
    throw new WorkspaceResolutionError(
      `workspace_path resolves inside an extension cache directory: ${resolved}. Provide the user workspace path instead.`,
      { code: 'WORKSPACE_IN_EXTENSION_CACHE', details: { workspace_path: resolved } }
    );
  }
  try {
    return resolveGitRoot(resolved);
  } catch {
    return resolved;
  }
}

export { resolveProjectRoot, resolveProjectRootForRuntime, requireExplicitWorkspaceRoot, requireWorkspaceRoot, WorkspaceResolutionError };
