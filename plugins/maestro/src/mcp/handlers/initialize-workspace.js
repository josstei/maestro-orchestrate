'use strict';

const path = require('node:path');

const {
  WORKSPACE_SUBDIRS,
  ensureWorkspace,
  resolveStateDirSetting,
} = require('../../state/session-state');
const { requireExplicitWorkspaceRoot } = require('../../core/project-root-resolver');

/**
 * initialize_workspace: create the state and plans directories under the
 * given workspace and record it as the project root. Without workspace_path
 * it re-initializes the current project root, if there is one.
 */
function handleInitializeWorkspace(params, projectRoot, { workspace }) {
  const resolvedWorkspace = requireExplicitWorkspaceRoot(params.workspace_path || projectRoot);

  const stateDirSetting = resolveStateDirSetting(resolvedWorkspace, params.state_dir);
  const alreadyExisted = ensureWorkspace(resolvedWorkspace, stateDirSetting);
  // Recorded only once the workspace exists, so a failed call keeps the
  // previous project root.
  workspace.setExplicitWorkspacePath(resolvedWorkspace);

  return {
    success: true,
    workspace_path: resolvedWorkspace,
    state_dir: stateDirSetting,
    created_directories: WORKSPACE_SUBDIRS.map((dir) => path.join(stateDirSetting, `${dir}/`)),
    already_existed: alreadyExisted,
  };
}

module.exports = { handleInitializeWorkspace };
