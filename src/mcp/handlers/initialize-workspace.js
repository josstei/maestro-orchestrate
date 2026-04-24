'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { ensureWorkspace, resolveStateDirPath } = require('../../state/session-state');
const { resolveSetting } = require('../../config/setting-resolver');
const {
  requireExplicitWorkspaceRoot,
} = require('../../core/project-root-resolver');
const { writeWorkspaceMarker } = require('../contracts/workspace-marker');

async function handleInitializeWorkspace(params = {}, cachedProjectRoot) {
  const workspacePath =
    params.workspace_path || cachedProjectRoot || null;

  const resolvedWorkspace = requireExplicitWorkspaceRoot({
    workspacePath,
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
    ].map((dir) => path.join(stateDir, dir)),
    already_existed: alreadyExisted,
  };
}

module.exports = { handleInitializeWorkspace };
