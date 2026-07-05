import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { handleRecordDesignApproval } from '../../src/mcp/handlers/design-gate.js';
import {
  createInitializedMcpWorkspace,
  writeWorkspaceFile,
} from '../support/mcp.js';

function fakeCtx(projectRoot, elicit) {
  return { projectRoot, elicit };
}

describe('design gate — elicitation-backed consent', () => {
  it('accept records first-party consent with approved_at and a consent-evidence marker', async () => {
    const { workspace, server } = await createInitializedMcpWorkspace({
      prefix: 'maestro-gate-consent-',
    });
    await server.callTool('enter_design_gate', { session_id: 'alpha' }, workspace);
    const designPath = writeWorkspaceFile(
      workspace,
      'docs/maestro/plans/design.md',
      '# Design\n'
    );

    let observedMessage;
    let observedSchema;
    const elicitedContent = { note: 'looks good' };
    const elicit = async ({ message, requestedSchema }) => {
      observedMessage = message;
      observedSchema = requestedSchema;
      return { action: 'accept', content: elicitedContent };
    };

    const result = await handleRecordDesignApproval(
      { session_id: 'alpha', design_document_path: designPath },
      fakeCtx(workspace, elicit)
    );

    assert.equal(result.success, true);
    assert.match(result.approved_at, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(result.consent_evidence, 'first-party');
    assert.equal(typeof observedMessage, 'string');
    assert.ok(observedMessage.length > 0);
    assert.equal(typeof observedSchema, 'object');

    const status = await server.callTool('get_design_gate_status', { session_id: 'alpha' }, workspace);
    assert.equal(status.result.consent_evidence, 'first-party');
    assert.match(status.result.approved_at, /^\d{4}-\d{2}-\d{2}T/);
    assert.deepEqual(status.result.consent_content, elicitedContent);
  });

  it('decline hard-fails: throws and does not set approved_at or write an approved gate', async () => {
    const { workspace, server } = await createInitializedMcpWorkspace({
      prefix: 'maestro-gate-consent-',
    });
    await server.callTool('enter_design_gate', { session_id: 'alpha' }, workspace);
    const designPath = writeWorkspaceFile(
      workspace,
      'docs/maestro/plans/design.md',
      '# Design\n'
    );

    const elicit = async () => ({ action: 'decline' });

    await assert.rejects(
      () =>
        handleRecordDesignApproval(
          { session_id: 'alpha', design_document_path: designPath },
          fakeCtx(workspace, elicit)
        ),
      /declin/i
    );

    const status = await server.callTool('get_design_gate_status', { session_id: 'alpha' }, workspace);
    assert.equal(status.result.approved_at, null);
  });

  it('decline on the content variant writes nothing to plans/ (zero FS mutation before the hard-fail)', async () => {
    const { workspace, server } = await createInitializedMcpWorkspace({
      prefix: 'maestro-gate-consent-',
    });
    await server.callTool('enter_design_gate', { session_id: 'alpha' }, workspace);

    const plansDir = path.join(workspace, 'docs/maestro/plans');
    const destination = path.join(plansDir, 'declined-design.md');

    const elicit = async () => ({ action: 'decline' });

    await assert.rejects(
      () =>
        handleRecordDesignApproval(
          {
            session_id: 'alpha',
            design_document_content: '# Declined\n',
            design_document_filename: 'declined-design.md',
          },
          fakeCtx(workspace, elicit)
        ),
      /declin/i
    );

    assert.equal(fs.existsSync(destination), false);

    const status = await server.callTool('get_design_gate_status', { session_id: 'alpha' }, workspace);
    assert.equal(status.result.approved_at, null);
  });

  it('cancel falls back to model-attested consent', async () => {
    const { workspace, server } = await createInitializedMcpWorkspace({
      prefix: 'maestro-gate-consent-',
    });
    await server.callTool('enter_design_gate', { session_id: 'alpha' }, workspace);
    const designPath = writeWorkspaceFile(
      workspace,
      'docs/maestro/plans/design.md',
      '# Design\n'
    );

    const elicit = async () => ({ action: 'cancel' });

    const result = await handleRecordDesignApproval(
      { session_id: 'alpha', design_document_path: designPath },
      fakeCtx(workspace, elicit)
    );

    assert.equal(result.success, true);
    assert.match(result.approved_at, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(result.consent_evidence, 'model-attested');
  });

  it('timeout/error (elicit throws, caught upstream and surfaced as null per ctx.elicit contract) falls back to model-attested', async () => {
    const { workspace, server } = await createInitializedMcpWorkspace({
      prefix: 'maestro-gate-consent-',
    });
    await server.callTool('enter_design_gate', { session_id: 'alpha' }, workspace);
    const designPath = writeWorkspaceFile(
      workspace,
      'docs/maestro/plans/design.md',
      '# Design\n'
    );

    const elicit = async () => null;

    const result = await handleRecordDesignApproval(
      { session_id: 'alpha', design_document_path: designPath },
      fakeCtx(workspace, elicit)
    );

    assert.equal(result.success, true);
    assert.equal(result.consent_evidence, 'model-attested');
  });

  it('no-elicitation client (ctx.elicit -> null) is unchanged model-attested behavior', async () => {
    const { workspace, server } = await createInitializedMcpWorkspace({
      prefix: 'maestro-gate-consent-',
    });
    await server.callTool('enter_design_gate', { session_id: 'alpha' }, workspace);
    const designPath = writeWorkspaceFile(
      workspace,
      'docs/maestro/plans/design.md',
      '# Design\n'
    );

    const outcome = await server.callTool(
      'record_design_approval',
      { session_id: 'alpha', design_document_path: designPath },
      workspace
    );

    assert.equal(outcome.ok, true);
    assert.match(outcome.result.approved_at, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(outcome.result.consent_evidence, 'model-attested');
  });

  it('the record_design_approval tool is wired to reach ctx.elicit (the seam), not a raw elicitInput call', async () => {
    const { workspace, server } = await createInitializedMcpWorkspace({
      prefix: 'maestro-gate-consent-',
    });
    await server.callTool('enter_design_gate', { session_id: 'alpha' }, workspace);
    const designPath = writeWorkspaceFile(
      workspace,
      'docs/maestro/plans/design.md',
      '# Design\n'
    );

    const lowLevelServer = server.server.server;
    const capabilities = lowLevelServer.getClientCapabilities;
    let capturedCapabilities;
    lowLevelServer.getClientCapabilities = (...args) => {
      capturedCapabilities = capabilities.apply(lowLevelServer, args);
      return capturedCapabilities;
    };

    const outcome = await server.callTool(
      'record_design_approval',
      { session_id: 'alpha', design_document_path: designPath },
      workspace
    );

    assert.equal(outcome.ok, true);
    assert.equal(outcome.result.consent_evidence, 'model-attested');
    assert.ok(
      capturedCapabilities !== undefined,
      'record_design_approval must consult ctx.elicit (which prechecks getClientCapabilities), proving the seam is used'
    );
  });
});
