import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MARKER_FILENAME, writeWorkspaceMarker } from '../../dist/src/mcp/contracts/workspace-marker.js';

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

});
