'use strict';

const { execSync } = require('child_process');

function resolveProjectRoot() {
  const workspacePath = process.env.MAESTRO_WORKSPACE_PATH || process.env.CLAUDE_PROJECT_DIR;
  if (workspacePath && !workspacePath.includes('${')) {
    return workspacePath;
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
