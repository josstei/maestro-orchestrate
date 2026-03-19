'use strict';

const { execSync } = require('child_process');

function resolveProjectRoot() {
  if (process.env.MAESTRO_WORKSPACE_PATH && !process.env.MAESTRO_WORKSPACE_PATH.includes('${')) {
    return process.env.MAESTRO_WORKSPACE_PATH;
  }
  try {
    return execSync('git rev-parse --show-toplevel', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return process.cwd();
  }
}

module.exports = { resolveProjectRoot };
