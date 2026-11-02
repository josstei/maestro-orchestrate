'use strict';

const path = require('node:path');

const {
  WORKSPACE_SUBDIRS,
  resolveStateDirSetting,
} = require('../../state/paths');
const { ensureWorkspace } = require('../../state/session-state');
const {
  requireExplicitWorkspaceRoot,
} = require('../../core/project-root-resolver');

async function handleInitializeWorkspace(params = {}) {
  const resolvedWorkspace = requireExplicitWorkspaceRoot(params.workspace_path);

  const stateDir = resolveStateDirSetting(resolvedWorkspace, params.state_dir);
  const { alreadyExisted } = await ensureWorkspace(stateDir, resolvedWorkspace);

  return {
    success: true,
    workspace_path: resolvedWorkspace,
    state_dir: stateDir,
    created_directories: WORKSPACE_SUBDIRS.map((dir) => path.join(stateDir, `${dir}/`)),
    already_existed: alreadyExisted,
  };
}

module.exports = { handleInitializeWorkspace };
