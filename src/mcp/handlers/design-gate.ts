import fs from 'fs';
import path from 'path';
import { assertSessionId } from '../../lib/validation/index.js';
import { ValidationError, StateError } from '../../lib/errors/index.js';
import { resolveStateDirPath } from '../../state/session-state.js';
import { atomicWriteSync } from '../../lib/io/index.js';
import {
  assertPlansFilename,
  resolveDocumentInputVariant,
  writePlansDocumentContent,
} from './document-input.js';
import { buildDesignApprovalConsentSchema } from '../server/elicitation-schemas.js';
import { attempt } from './attempt.js';
import { requireWorkspaceRoot } from '../../core/project-root-resolver.js';
import { zodSchemas } from '../tool-packs/session/zod-schemas.js';
import type { HandlerContext } from '../server/tool-types.js';
import type { z } from 'zod';
const GATE_FILENAME = '.design-gate.json';
const MODEL_ATTESTED_CONSENT = 'model-attested';
const FIRST_PARTY_CONSENT = 'first-party';

type RecordDesignApprovalParams = z.infer<z.ZodObject<typeof zodSchemas.record_design_approval>>;

/**
 * Resolves the filesystem path for the gate file for a given session.
 * @param {string} projectRoot
 * @param {string} sessionId
 * @returns {string}
 */
function gatePath(projectRoot: any, sessionId: any) {
  const stateDir = resolveStateDirPath(projectRoot);
  return path.join(stateDir, 'state', `${sessionId}${GATE_FILENAME}`);
}

/**
 * Build a freshly-entered gate record: `entered_at` set to now, `approved_at`
 * and `design_document_path` unset. Shared by `handleEnterDesignGate` (new
 * gate) and `handleRecordDesignApproval` (fallback when no gate exists yet).
 *
 * @param {string} sessionId
 * @returns {{ session_id: string, entered_at: string, approved_at: null, design_document_path: null }}
 */
function emptyGate(sessionId: any) {
  return {
    session_id: sessionId,
    entered_at: new Date().toISOString(),
    approved_at: null,
    design_document_path: null,
  };
}

/**
 * @param {string} projectRoot
 * @param {string} sessionId
 * @returns {{ session_id: string, entered_at: string | null, approved_at: string | null, design_document_path: string | null } | null}
 */
function readGate(projectRoot: any, sessionId: any) {
  const filePath = gatePath(projectRoot, sessionId);
  if (!fs.existsSync(filePath)) return null;
  return attempt(() => JSON.parse(fs.readFileSync(filePath, 'utf8')), null);
}

/**
 * @param {string} projectRoot
 * @param {string} sessionId
 * @param {object} data
 */
function writeGate(projectRoot: any, sessionId: any, data: any) {
  const filePath = gatePath(projectRoot, sessionId);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  atomicWriteSync(filePath, JSON.stringify(data, null, 2));
}

/**
 * @param {{ session_id: string }} params
 * @param {string} projectRoot
 */
function handleEnterDesignGate(params: any, projectRoot: any) {
  assertSessionId(params.session_id);
  const existing = readGate(projectRoot, params.session_id);
  if (existing && existing.entered_at) {
    return { success: true, entered_at: existing.entered_at, already_entered: true };
  }
  const gate = emptyGate(params.session_id);
  writeGate(projectRoot, params.session_id, gate);
  return { success: true, entered_at: gate.entered_at, already_entered: false };
}

/**
 * Validate the SHAPE of the caller's approved-design input with NO filesystem
 * mutation. Accepts exactly one of (design_document_path) or
 * (design_document_content + design_document_filename); for the content
 * variant this also validates the filename is a safe plans/ basename and the
 * content is a non-empty string. Malformed-params errors must surface here,
 * BEFORE any consent prompt — see `materializeApprovedDesignDocument` for the
 * write, which only happens after consent is resolved.
 *
 * @param {object} params
 * @param {string} [params.design_document_path]
 * @param {string} [params.design_document_content]
 * @param {string} [params.design_document_filename]
 * @returns {{kind: 'path', path: string} | {kind: 'content', filename: string, content: string}}
 * @throws {ValidationError} when neither or both input variants are supplied, or the content variant is malformed
 */
function validateApprovedDesignDocumentShape(params: any) {
  const variant = resolveDocumentInputVariant(params, {
    pathKey: 'design_document_path',
    contentKey: 'design_document_content',
    filenameKey: 'design_document_filename',
    requireMessage:
      'record_design_approval requires either design_document_path or both design_document_content and design_document_filename',
  });
  if (!variant) {
    throw new ValidationError(
      'record_design_approval requires either design_document_path or both design_document_content and design_document_filename'
    );
  }
  if (variant.kind === 'content') {
    assertPlansFilename(variant.filename, 'design_document_filename');
  }
  return variant;
}

/**
 * Materialize a shape-validated approved-design input to a canonical absolute
 * path. The content variant writes the file immediately inside
 * `<state_dir>/plans/`, eliminating the path-resolution ambiguity that arises
 * when callers write through a runtime surface whose filesystem root differs
 * from the MCP server's workspace (e.g. Gemini Plan Mode writes to
 * `~/.gemini/tmp/<uuid>/...`). Callers MUST only invoke this after consent has
 * been granted — it performs the filesystem mutation that a decline must not
 * cause.
 *
 * @param {{kind: 'path', path: string} | {kind: 'content', filename: string, content: string}} variant
 * @param {string} projectRoot
 * @returns {string} canonical absolute path of the approved design document
 */
function materializeApprovedDesignDocument(variant: any, projectRoot: any) {
  if (variant.kind === 'path') {
    return path.isAbsolute(variant.path) ? variant.path : path.join(projectRoot, variant.path);
  }
  return writePlansDocumentContent(projectRoot, variant.filename, variant.content, 'design_document_filename');
}

/**
 * Resolve first-party consent evidence for a design approval via `ctx.elicit`
 * (the single elicitation seam built at Task 3.4 — this function never calls
 * `elicitInput` directly and never re-implements its capability precheck,
 * timeout, or error handling). Maps the SDK's `elicitInput` outcome to
 * maestro's consent model:
 *
 * - `ctx.elicit` unsupported / errored (returns `null`) -> model-attested.
 * - `action === 'accept'` -> first-party consent, carrying the elicited
 *   content forward for audit.
 * - `action === 'decline'` -> hard-fail; the caller must not record approval.
 * - any other action (`cancel`, timeout, signal-abort) -> model-attested
 *   fallback, matching the unsupported-client behavior.
 *
 * @param {(params: {message: string, requestedSchema: object}) => Promise<{action: string, content?: object}|null>} elicit
 * @param {string} sessionId
 * @returns {Promise<{evidence: 'model-attested'} | {evidence: 'first-party', content: object|undefined}>}
 * @throws {StateError} when the elicited action is `decline`
 */
async function resolveDesignApprovalConsent(elicit: any, sessionId: any) {
  if (typeof elicit !== 'function') {
    return { evidence: MODEL_ATTESTED_CONSENT };
  }

  const elicited = await elicit({
    message: `Approve the design document for session "${sessionId}"?`,
    requestedSchema: buildDesignApprovalConsentSchema(),
  });

  if (!elicited || elicited.action !== 'accept') {
    if (elicited && elicited.action === 'decline') {
      throw new StateError(
        `Design approval was declined for session "${sessionId}"; the design gate remains unapproved.`,
        { code: 'DESIGN_APPROVAL_DECLINED', details: { session_id: sessionId } }
      );
    }
    return { evidence: MODEL_ATTESTED_CONSENT };
  }

  return { evidence: FIRST_PARTY_CONSENT, content: elicited.content };
}

/**
 * @param {{ session_id: string, design_document_path?: string, design_document_content?: string, design_document_filename?: string }} params
 * @param {{ projectRoot: string, elicit: (params: {message: string, requestedSchema: object}) => Promise<{action: string, content?: object}|null> }} ctx
 */
async function handleRecordDesignApproval(params: RecordDesignApprovalParams, ctx: HandlerContext) {
  assertSessionId(params.session_id);
  const projectRoot = requireWorkspaceRoot(ctx.projectRoot, 'record_design_approval');
  const { elicit } = ctx;
  const documentVariant = validateApprovedDesignDocumentShape(params);

  const consent = await resolveDesignApprovalConsent(elicit, params.session_id);

  const absDesignPath = materializeApprovedDesignDocument(documentVariant, projectRoot);

  const gate = readGate(projectRoot, params.session_id) || emptyGate(params.session_id);
  gate.approved_at = new Date().toISOString();
  gate.design_document_path = absDesignPath;
  gate.consent_evidence = consent.evidence;
  if (consent.evidence === FIRST_PARTY_CONSENT && consent.content !== undefined) {
    gate.consent_content = consent.content;
  } else {
    delete gate.consent_content;
  }
  writeGate(projectRoot, params.session_id, gate);

  return {
    success: true,
    entered_at: gate.entered_at,
    approved_at: gate.approved_at,
    design_document_path: absDesignPath,
    consent_evidence: gate.consent_evidence,
  };
}

/**
 * @param {{ session_id: string }} params
 * @param {string} projectRoot
 */
function handleGetDesignGateStatus(params: any, projectRoot: any) {
  assertSessionId(params.session_id);
  const gate = readGate(projectRoot, params.session_id);
  if (!gate) {
    return {
      session_id: params.session_id,
      entered_at: null,
      approved_at: null,
      design_document_path: null,
    };
  }
  return gate;
}

/**
 * Returns true when a session has entered the design gate but not yet received approval.
 * Used by create_session (Task 12) to block session creation until the gate is cleared.
 * @param {string} projectRoot
 * @param {string} sessionId
 * @returns {boolean}
 */
function isDesignGateBlockingCreate(projectRoot: any, sessionId: any) {
  const gate = readGate(projectRoot, sessionId);
  if (!gate) return false;
  return !!(gate.entered_at && !gate.approved_at);
}

/**
 * Returns true when a gate artifact exists on disk for the given session_id,
 * regardless of whether it is approved. Used by the orphan-gate guard in
 * create_session to distinguish "orchestrator never entered this session's
 * gate" from "orchestrator is in the normal approve-then-create flow".
 * @param {string} projectRoot
 * @param {string} sessionId
 * @returns {boolean}
 */
function hasDesignGate(projectRoot: any, sessionId: any) {
  return readGate(projectRoot, sessionId) !== null;
}

/**
 * Read the design document path persisted on the gate after approval. Used by
 * create_session to auto-populate `state.design_document` when the orchestrator
 * does not pass it explicitly — avoids losing the document during archival.
 * @param {string} projectRoot
 * @param {string} sessionId
 * @returns {string | null}
 */
function getApprovedDesignDocumentPath(projectRoot: any, sessionId: any) {
  const gate = readGate(projectRoot, sessionId);
  if (!gate || !gate.approved_at) return null;
  return gate.design_document_path || null;
}

/**
 * Enumerate every approved design gate currently persisted in the workspace.
 * Reads the `state/` directory once and parses each `<session_id>.design-gate.json`
 * artifact. Corrupt or unapproved gate files are skipped silently. Used by
 * create_session to detect session_id drift across the enter_design_gate →
 * record_design_approval → create_session sequence.
 *
 * @param {string} projectRoot
 * @returns {Array<{session_id: string, approved_at: string, design_document_path: string | null}>}
 */
function listApprovedGates(projectRoot: any) {
  const stateDir = path.join(resolveStateDirPath(projectRoot), 'state');
  if (!fs.existsSync(stateDir)) return [];
  const entries = attempt(() => fs.readdirSync(stateDir), null);
  if (!entries) return [];
  const gates = [];
  for (const entry of entries) {
    if (!entry.endsWith(GATE_FILENAME)) continue;
    const sessionId = entry.slice(0, -GATE_FILENAME.length);
    if (sessionId.length === 0) continue;
    const filePath = path.join(stateDir, entry);
    const gate = attempt(() => JSON.parse(fs.readFileSync(filePath, 'utf8')), null);
    if (gate && typeof gate.approved_at === 'string' && gate.approved_at.length > 0) {
      gates.push({
        session_id: sessionId,
        approved_at: gate.approved_at,
        design_document_path: gate.design_document_path || null,
      });
    }
  }
  return gates;
}

/**
 * Find approved design gates whose session_id does not match the caller's.
 * The orchestrator must use a single session_id from enter_design_gate through
 * archive_session; a mismatched approved gate signals either (a) an in-flight
 * workflow the caller forgot to continue with the original id or (b) an
 * abandoned prior run. create_session uses this to fail fast rather than
 * silently discard the approved design document.
 *
 * @param {string} projectRoot
 * @param {string} currentSessionId
 * @returns {Array<{session_id: string, approved_at: string, design_document_path: string | null}>}
 */
function findOrphanedApprovedGates(projectRoot: any, currentSessionId: any) {
  return listApprovedGates(projectRoot).filter(
    (gate: any) => gate.session_id !== currentSessionId
  );
}

/**
 * Remove the design-gate artifact for a session. Called by archive_session so
 * the gate doesn't linger in state/ after the session is archived — otherwise
 * a future session reusing the same id would inherit a stale "already approved"
 * gate from the prior run.
 * @param {string} projectRoot
 * @param {string} sessionId
 * @returns {string | null} path of the removed gate file, or null if no gate existed
 */
function removeDesignGate(projectRoot: any, sessionId: any) {
  const filePath = gatePath(projectRoot, sessionId);
  if (!fs.existsSync(filePath)) return null;
  fs.unlinkSync(filePath);
  return filePath;
}

export { handleEnterDesignGate, handleRecordDesignApproval, handleGetDesignGateStatus, isDesignGateBlockingCreate, hasDesignGate, getApprovedDesignDocumentPath, listApprovedGates, findOrphanedApprovedGates, removeDesignGate, writeGate };
