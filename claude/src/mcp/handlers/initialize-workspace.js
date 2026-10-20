'use strict';

const fs = require('node:fs');
const path = require('node:path');

const {
  WORKSPACE_SUBDIRS,
  ensureWorkspace,
  resolveStateDirSetting,
  resolveStateDirPath,
} = require('../../state/session-state');
const { requireExplicitWorkspaceRoot } = require('../../core/project-root-resolver');

/**
 * initialize_workspace: create the state and plans directories under the
 * given workspace and record it as the project root. Without workspace_path
 * it re-initializes the current project root, if there is one.
 */
function handleInitializeWorkspace(params, projectRoot, { workspace }) {
  const resolvedWorkspace = requireExplicitWorkspaceRoot(params.workspace_path || projectRoot);

  const stateDir = resolveStateDirSetting(resolvedWorkspace, params.state_dir);
  const fullStatePath = resolveStateDirPath(resolvedWorkspace, stateDir);
  const alreadyExisted = fs.existsSync(path.join(fullStatePath, 'state'));

  ensureWorkspace(stateDir, resolvedWorkspace);
  // Recorded only once the workspace exists, so a failed call keeps the
  // previous project root.
  workspace.setExplicitWorkspacePath(resolvedWorkspace);

  return {
    success: true,
    workspace_path: resolvedWorkspace,
    state_dir: stateDir,
    created_directories: WORKSPACE_SUBDIRS.map((dir) => path.join(stateDir, `${dir}/`)),
    already_existed: alreadyExisted,
  };
}

module.exports = { handleInitializeWorkspace };
