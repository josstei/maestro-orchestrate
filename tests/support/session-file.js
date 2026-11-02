'use strict';

const fs = require('node:fs');
const path = require('node:path');

const markdownState = require('../../src/core/markdown-state');
const { writeFile } = require('./fs');

function activeSessionPath(workspace, stateDir = 'docs/maestro') {
  return path.join(workspace, stateDir, 'state', 'active-session.md');
}

function readSessionState(workspace) {
  return markdownState.parse(fs.readFileSync(activeSessionPath(workspace), 'utf8')).data;
}

/** Writes `data` as the active session file, in create_session's JSON-frontmatter format. */
function writeSessionState(workspace, data, stateDir) {
  return writeFile(activeSessionPath(workspace, stateDir), markdownState.serialize(data, '# Session\n'));
}

module.exports = {
  activeSessionPath,
  readSessionState,
  writeSessionState,
};
