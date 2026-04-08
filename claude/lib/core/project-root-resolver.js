'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function resolveGitRoot(baseDir) {
  return execSync('git rev-parse --show-toplevel', {
    cwd: baseDir,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

function resolveProjectRoot() {
  const candidates = [
    process.env.MAESTRO_WORKSPACE_PATH,
    process.env.CLAUDE_PROJECT_DIR,
    process.env.PWD,
    process.env.INIT_CWD,
  ];

  for (const candidate of candidates) {
    if (!candidate || candidate.includes('${')) {
      continue;
    }

    const resolvedCandidate = path.resolve(candidate);
    if (!fs.existsSync(resolvedCandidate)) {
      continue;
    }

    try {
      return resolveGitRoot(resolvedCandidate);
    } catch {
      return resolvedCandidate;
    }
  }

  try {
    return resolveGitRoot(process.cwd());
  } catch {
    return process.cwd();
  }
}

module.exports = { resolveProjectRoot };
