'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  MARKER_FILENAME,
  writeWorkspaceMarker,
} = require('../../src/mcp/contracts/workspace-marker');
const { makeTempDir, readJson } = require('../support/fs');

describe('workspace-marker', () => {
  it('exposes the marker filename', () => {
    assert.equal(MARKER_FILENAME, '.workspace-root');
  });

  it('writeWorkspaceMarker creates the marker with the expected JSON shape', () => {
    const workspace = makeTempDir('maestro-marker-');
    const stateDir = path.join(workspace, 'docs', 'maestro');
    fs.mkdirSync(stateDir, { recursive: true });

    writeWorkspaceMarker(stateDir, workspace);

    const markerPath = path.join(stateDir, MARKER_FILENAME);
    const marker = readJson(markerPath);
    assert.equal(marker.workspace_path, workspace);
    assert.equal(marker.schema_version, 1);
    assert.match(marker.written_at, /^\d{4}-\d{2}-\d{2}T/);
  });
});
