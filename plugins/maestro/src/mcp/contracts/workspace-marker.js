'use strict';

const fs = require('node:fs');
const path = require('node:path');

const MARKER_FILENAME = '.workspace-root';
const SCHEMA_VERSION = 1;

function markerPathFor(stateDir) {
  return path.join(stateDir, MARKER_FILENAME);
}

/**
 * Reads and validates the workspace marker file from the given state directory.
 *
 * Returns null when the file is absent, contains malformed JSON, or was written
 * by an incompatible schema version.
 *
 * @param {string} stateDir - Absolute path to the Maestro state directory.
 * @returns {{ workspace_path: string, written_at: string, schema_version: number } | null}
 */
function readWorkspaceMarker(stateDir) {
  const markerPath = markerPathFor(stateDir);
  if (!fs.existsSync(markerPath)) {
    return null;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
    if (
      !parsed ||
      typeof parsed.workspace_path !== 'string' ||
      parsed.schema_version !== SCHEMA_VERSION
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

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
  fs.writeFileSync(markerPathFor(stateDir), JSON.stringify(payload, null, 2));
}

module.exports = { MARKER_FILENAME, SCHEMA_VERSION, readWorkspaceMarker, writeWorkspaceMarker };
