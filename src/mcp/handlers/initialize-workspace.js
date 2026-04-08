'use strict';

const fs = require('fs');
const path = require('path');

const { ensureWorkspace, resolveStateDirPath } = require('../../state/session-state');
const { resolveSetting } = require('../../config/setting-resolver');

function handleInitializeWorkspace(params, projectRoot) {
  const stateDir =
    params.state_dir ||
    resolveSetting('MAESTRO_STATE_DIR', projectRoot) ||
    'docs/maestro';
  const fullPath = resolveStateDirPath(projectRoot, stateDir);
  const alreadyExisted = fs.existsSync(path.join(fullPath, 'state'));

  ensureWorkspace(stateDir, projectRoot);

  return {
    success: true,
    state_dir: stateDir,
    created_directories: [
      'state/',
      'state/archive/',
      'plans/',
      'plans/archive/',
    ].map((directory) => path.join(stateDir, directory)),
    already_existed: alreadyExisted,
  };
}

module.exports = {
  handleInitializeWorkspace,
};
