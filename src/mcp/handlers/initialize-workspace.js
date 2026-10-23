'use strict';

const fs = require('node:fs');
const path = require('node:path');

const {
  WORKSPACE_SUBDIRS,
  resolveStateDirSetting,
  resolveStateDirPath,
} = require('../../state/paths');
const { ensureWorkspace } = require('../../state/session-state');
const {
  requireExplicitWorkspaceRoot,
} = require('../../core/project-root-resolver');

async function handleInitializeWorkspace(params = {}, cachedProjectRoot) {
  const workspacePath =
    params.workspace_path || cachedProjectRoot || null;

  const resolvedWorkspace = requireExplicitWorkspaceRoot({
    workspacePath,
  });

  const stateDir = resolveStateDirSetting(resolvedWorkspace, params.state_dir);
  const fullStatePath = resolveStateDirPath(resolvedWorkspace, stateDir);
  const alreadyExisted = fs.existsSync(path.join(fullStatePath, 'state'));

  await ensureWorkspace(stateDir, resolvedWorkspace);

  return {
    success: true,
    workspace_path: resolvedWorkspace,
    state_dir: stateDir,
    created_directories: WORKSPACE_SUBDIRS.map((dir) => path.join(stateDir, `${dir}/`)),
    already_existed: alreadyExisted,
  };
}

module.exports = { handleInitializeWorkspace };
