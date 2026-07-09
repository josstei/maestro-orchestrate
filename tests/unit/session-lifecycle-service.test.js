import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  archiveSession,
  createSession,
  getSessionStatus,
  updateSession,
} from '../../dist/src/mcp/session/session-lifecycle-service.js';
import { ensureMaestroWorkspace, makeTempWorkspace, phaseFixture } from '../support/mcp.js';

describe('session lifecycle service', () => {
  it('creates, reports, updates, and archives a session through the service boundary', () => {
    const workspace = ensureMaestroWorkspace(makeTempWorkspace('maestro-session-lifecycle-'));

    const created = createSession(
      {
        session_id: 'service-session',
        task: 'service boundary',
        task_complexity: 'medium',
        phases: [
          phaseFixture({ id: 1, name: 'Phase 1', blocked_by: [] }),
          phaseFixture({ id: 2, name: 'Phase 2', blocked_by: [1] }),
        ],
      },
      workspace
    );

    assert.equal(created.success, true);
    assert.equal(fs.existsSync(created.path), true);

    const status = getSessionStatus({}, workspace);
    assert.equal(status.exists, true);
    assert.equal(status.session_id, 'service-session');
    assert.equal(status.current_phase, 1);

    const updated = updateSession(
      {
        session_id: 'service-session',
        execution_mode: 'parallel',
        current_batch: 'batch-1',
      },
      workspace
    );
    assert.deepEqual(updated.updated_fields, ['execution_mode', 'current_batch']);

    const archived = archiveSession({ session_id: 'service-session' }, workspace);
    assert.equal(archived.success, true);
    assert.equal(fs.existsSync(archived.archive_path), true);
    assert.equal(
      fs.existsSync(path.join(workspace, 'docs', 'maestro', 'state', 'active-session.md')),
      false
    );
  });
});
