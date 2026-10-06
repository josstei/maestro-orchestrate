'use strict';

const fs = require('node:fs');
const path = require('node:path');

const MARKER_FILENAME = '.workspace-root';
const SCHEMA_VERSION = 1;

/**
 * Writes a workspace marker file into the given state directory.
 *
 * Creates the state directory if it does not already exist.
 *
 * @param {string} stateDir - Absolute path to the Maestro state directory.
 * @param {string} workspacePath - Absolute path to the resolved workspace root.
 * @returns {void}
 */
function writeWorkspaceMarker(stateDir, workspacePath) {
  const payload = {
    workspace_path: workspacePath,
    written_at: new Date().toISOString(),
    schema_version: SCHEMA_VERSION,
  };
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, MARKER_FILENAME), JSON.stringify(payload, null, 2));
}

module.exports = { MARKER_FILENAME, writeWorkspaceMarker };
