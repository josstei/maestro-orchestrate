'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  MARKER_FILENAME,
  readWorkspaceMarker,
  writeWorkspaceMarker,
} = require('../../src/mcp/contracts/workspace-marker');

function makeTempWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-marker-'));
}

describe('workspace-marker', () => {
  it('exposes the marker filename', () => {
    assert.equal(MARKER_FILENAME, '.workspace-root');
  });

  it('writeWorkspaceMarker creates the marker with the expected JSON shape', () => {
    const workspace = makeTempWorkspace();
    const stateDir = path.join(workspace, 'docs', 'maestro');
    fs.mkdirSync(stateDir, { recursive: true });

    writeWorkspaceMarker(stateDir, workspace);

    const markerPath = path.join(stateDir, MARKER_FILENAME);
    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
    assert.equal(marker.workspace_path, workspace);
    assert.equal(marker.schema_version, 1);
    assert.match(marker.written_at, /^\d{4}-\d{2}-\d{2}T/);
  });

  it('readWorkspaceMarker returns null when missing', () => {
    const workspace = makeTempWorkspace();
    const stateDir = path.join(workspace, 'docs', 'maestro');
    fs.mkdirSync(stateDir, { recursive: true });
    assert.equal(readWorkspaceMarker(stateDir), null);
  });

  it('readWorkspaceMarker returns null when malformed', () => {
    const workspace = makeTempWorkspace();
    const stateDir = path.join(workspace, 'docs', 'maestro');
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(path.join(stateDir, MARKER_FILENAME), 'not json');
    assert.equal(readWorkspaceMarker(stateDir), null);
  });

  it('round-trips a written marker', () => {
    const workspace = makeTempWorkspace();
    const stateDir = path.join(workspace, 'docs', 'maestro');
    fs.mkdirSync(stateDir, { recursive: true });
    writeWorkspaceMarker(stateDir, workspace);
    const marker = readWorkspaceMarker(stateDir);
    assert.equal(marker.workspace_path, workspace);
    assert.equal(marker.schema_version, 1);
  });
});
