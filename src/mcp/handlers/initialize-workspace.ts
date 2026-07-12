import fs from 'fs';
import path from 'path';
import { ensureWorkspace, resolveStateDirPath } from '../../state/session-state.js';
import { resolveSetting } from '../../config/setting-resolver.js';
import { requireExplicitWorkspaceRoot } from '../../core/project-root-resolver.js';
import { writeWorkspaceMarker } from '../contracts/workspace-marker.js';

async function handleInitializeWorkspace(params: any = {}) {
  const resolvedWorkspace = requireExplicitWorkspaceRoot({
    workspacePath: params.workspace_path,
  });

  const stateDir =
    params.state_dir ||
    resolveSetting('MAESTRO_STATE_DIR', resolvedWorkspace) ||
    'docs/maestro';
  const fullStatePath = resolveStateDirPath(resolvedWorkspace, stateDir);
  const alreadyExisted = fs.existsSync(path.join(fullStatePath, 'state'));

  ensureWorkspace(stateDir, resolvedWorkspace);
  writeWorkspaceMarker(fullStatePath, resolvedWorkspace);

  return {
    success: true,
    workspace_path: resolvedWorkspace,
    state_dir: stateDir,
    created_directories: [
      'state/',
      'state/archive/',
      'plans/',
      'plans/archive/',
    ].map((dir: any) => path.join(stateDir, dir)),
    already_existed: alreadyExisted,
  };
}

export { handleInitializeWorkspace };
