'use strict';

const fs = require('node:fs');
const path = require('node:path');

const markdownState = require('../../src/core/markdown-state');
const { writeFile } = require('./fs');

/**
 * Returns the path of a workspace's active session file.
 *
 * @param {string} workspace - Absolute path of the workspace
 * @param {string} [stateDir='docs/maestro'] - State directory relative to `workspace`
 * @returns {string} Absolute path of `<stateDir>/state/active-session.md`
 */
function activeSessionPath(workspace, stateDir = 'docs/maestro') {
  return path.join(workspace, stateDir, 'state', 'active-session.md');
}

/**
 * Reads and parses the JSON frontmatter of a workspace's active session file.
 *
 * @param {string} workspace - Absolute path of a workspace holding an active session
 * @param {string} [stateDir] - State directory relative to `workspace` (default `docs/maestro`)
 * @returns {Object} The parsed session state
 */
function readSessionState(workspace, stateDir) {
  return markdownState.parse(fs.readFileSync(activeSessionPath(workspace, stateDir), 'utf8')).data;
}

/**
 * Writes `data` as a workspace's active session file, in the JSON-frontmatter
 * format that create_session produces, creating missing directories first.
 *
 * @param {string} workspace - Absolute path of the workspace
 * @param {Object} data - Session state to serialize as frontmatter
 * @param {string} [stateDir] - State directory relative to `workspace` (default `docs/maestro`)
 * @returns {string} Absolute path of the written session file
 */
function writeSessionState(workspace, data, stateDir) {
  return writeFile(activeSessionPath(workspace, stateDir), markdownState.serialize(data, '# Session\n'));
}

module.exports = {
  activeSessionPath,
  readSessionState,
  writeSessionState,
};
