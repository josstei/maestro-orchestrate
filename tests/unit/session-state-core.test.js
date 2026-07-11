import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { StateError, ValidationError } from '../../dist/src/lib/errors/index.js';
import * as compatibility from '../../dist/src/mcp/handlers/session-state-core.js';
import * as canonical from '../../dist/src/mcp/session/session-store.js';
import * as repository from '../../dist/src/mcp/session/session-repository.js';
import { createSession } from '../../dist/src/mcp/session/session-lifecycle-service.js';
import {
  buildMcpServer,
  ensureMaestroWorkspace,
  makeTempWorkspace,
  phaseFixture,
} from '../support/mcp.js';
import { registerSessionPack } from '../../dist/src/mcp/tool-packs/session/index.js';

const { assertActiveSessionMatches, extractFileManifest } = compatibility;

describe('assertActiveSessionMatches', () => {
  it('does not throw when the session_id matches', () => {
    assert.doesNotThrow(() => {
      assertActiveSessionMatches({ session_id: 'test-session' }, 'test-session');
    });
  });

  it('throws a StateError with the exact mismatch message when session_id differs', () => {
    assert.throws(
      () => {
        assertActiveSessionMatches({ session_id: 'active-one' }, 'requested-two');
      },
      (err) => {
        assert.ok(err instanceof StateError);
        assert.equal(
          err.message,
          "Session mismatch: active session is 'active-one', got 'requested-two'"
        );
        return true;
      }
    );
  });
});

describe('extractFileManifest', () => {
  it('defaults missing file arrays to empty arrays', () => {
    const result = extractFileManifest({});
    assert.deepEqual(result.filesCreated, []);
    assert.deepEqual(result.filesModified, []);
    assert.deepEqual(result.filesDeleted, []);
    assert.equal(result.hasFiles, false);
  });

  it('preserves provided arrays verbatim', () => {
    const result = extractFileManifest({
      files_created: ['a.js'],
      files_modified: ['b.js'],
      files_deleted: ['c.js'],
    });
    assert.deepEqual(result.filesCreated, ['a.js']);
    assert.deepEqual(result.filesModified, ['b.js']);
    assert.deepEqual(result.filesDeleted, ['c.js']);
  });

  it('sets hasFiles true when any of the three arrays is non-empty', () => {
    assert.equal(extractFileManifest({ files_created: ['a.js'] }).hasFiles, true);
    assert.equal(extractFileManifest({ files_modified: ['b.js'] }).hasFiles, true);
    assert.equal(extractFileManifest({ files_deleted: ['c.js'] }).hasFiles, true);
  });

  it('sets hasFiles false when all three arrays are empty or absent', () => {
    assert.equal(
      extractFileManifest({
        files_created: [],
        files_modified: [],
        files_deleted: [],
      }).hasFiles,
      false
    );
    assert.equal(extractFileManifest({}).hasFiles, false);
  });

  it('the composed server rejects a non-array file manifest at the zod boundary', async () => {
    const server = await buildMcpServer({ toolPacks: [registerSessionPack] });
    const workspace = ensureMaestroWorkspace(makeTempWorkspace());
    const result = await server.callTool(
      'reconcile_phase',
      { session_id: 's1', phase_id: 1, files_created: 'not-an-array' },
      workspace
    );
    assert.equal(result.ok, false);
    assert.equal(result.code, 'INVALID_PARAMS');
    await server.close();
  });

  it('treats null manifest fields as absent', () => {
    const result = extractFileManifest({ files_created: null, files_modified: null });
    assert.deepEqual(result.filesCreated, []);
    assert.equal(result.hasFiles, false);
  });
});

describe('session-state-core compatibility surface', () => {
  it('re-exports every core helper from the canonical store module', () => {
    const names = [
      'resolveBasePath',
      'resolveActiveSessionPath',
      'parseSessionState',
      'serializeSessionState',
      'extractBody',
      'readActiveSession',
      'readActiveSessionOrNull',
      'writeActiveSession',
      'withSessionState',
      'assertActiveSessionMatches',
      'extractFileManifest',
      'createPendingPhaseProgress',
      'assertValidActiveSession',
      'withValidatedSession',
    ];
    assert.deepEqual(Object.keys(compatibility).sort(), names.sort());
    for (const name of names) {
      assert.equal(compatibility[name], canonical[name]);
    }
  });

  it('retains the session-repository export surface over the canonical store', () => {
    const names = [
      'archiveActiveSessionFile',
      'assertNoInProgressSession',
      'assertValidActiveSession',
      'extractBody',
      'parseSessionState',
      'readCurrentSession',
      'readCurrentSessionOrNull',
      'withSessionState',
      'withValidatedSession',
      'writeActiveSession',
      'writeNewActiveSession',
    ];
    assert.deepEqual(Object.keys(repository).sort(), names.sort());
    for (const name of names) {
      assert.equal(repository[name], canonical[name]);
    }
  });

  it('retains permissive legacy mutation outcomes without silently writing state', () => {
    const workspace = ensureMaestroWorkspace(makeTempWorkspace('maestro-core-compat-'));
    createSession(
      {
        session_id: 'compat-session',
        task: 'compatibility',
        phases: [phaseFixture()],
      },
      workspace
    );

    const missingOutcome = compatibility.withSessionState(workspace, ({ state }) => {
      state.current_batch = 'discarded';
    });
    assert.equal(missingOutcome, undefined);
    assert.equal(canonical.sessionStore.read(workspace).state.current_batch, null);

    const responseOnly = compatibility.withSessionState(workspace, ({ state }) => {
      state.current_batch = 'also-discarded';
      return { response: 'legacy-response' };
    });
    assert.equal(responseOnly, 'legacy-response');
    assert.equal(canonical.sessionStore.read(workspace).state.current_batch, null);

    compatibility.withSessionState(workspace, () => ({
      response: null,
      writeBack: true,
      body: undefined,
    }));
    assert.equal(canonical.sessionStore.read(workspace).body, '');

    compatibility.withSessionState(workspace, (session) => {
      session.content = compatibility.serializeSessionState(
        session.state,
        '# body from replacement content\n'
      );
      return { response: null, writeBack: true };
    });
    assert.equal(
      canonical.sessionStore.read(workspace).body,
      '# body from replacement content\n'
    );
  });
});
