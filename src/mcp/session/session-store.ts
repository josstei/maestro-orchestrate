import fs from 'node:fs';
import path from 'node:path';
import * as markdownState from '../../core/markdown-state.js';
import { StateError } from '../../lib/errors/index.js';
import { assertSessionId } from '../../lib/validation/index.js';
import type { SessionId } from '../../lib/validation/index.js';
import { readState, resolveStateDirPath, writeState } from '../../state/session-state.js';
import {
  ReadableSessionStateSchema,
  SessionStateSchema,
} from '../contracts/session-state-schema.js';
import type {
  ReadableSessionState,
  SessionState,
} from '../contracts/session-state-schema.js';
import { createEmptyDownstreamContext } from '../contracts/downstream-context.js';
import { migrateSessionState } from './session-migrations.js';

const ACTIVE_SESSION_REL = path.join('state', 'active-session.md');

interface SessionDocument<T = ReadableSessionState> {
  readonly basePath: string;
  readonly sessionPath: string;
  readonly content: string;
  readonly body: string;
  readonly state: T;
}

interface SessionMutation<R> {
  readonly response: R;
  readonly writeBack: boolean;
  readonly body?: string;
}

interface SessionStore {
  resolveBasePath(projectRoot: string): string;
  read(projectRoot: string): SessionDocument;
  readOrNull(projectRoot: string): SessionDocument | null;
  create(projectRoot: string, state: SessionState, body: string): string;
  update<R>(
    projectRoot: string,
    sessionId: SessionId,
    mutate: (document: SessionDocument) => SessionMutation<R>,
  ): R;
  write(
    document: SessionDocument,
    state: ReadableSessionState | SessionState,
    body?: string,
  ): void;
  archive(document: SessionDocument, sessionId: SessionId): string;
}

function resolveBasePath(projectRoot: any) {
  return resolveStateDirPath(projectRoot);
}

function resolveActiveSessionPath(basePath: any) {
  return path.join(basePath, ACTIVE_SESSION_REL);
}

function parseSessionState(content: any): ReadableSessionState {
  return parseSessionContent(content).state;
}

function serializeSessionState(data: any, bodyContent: any) {
  return markdownState.serialize(data, bodyContent);
}

function extractBody(content: any) {
  return markdownState.parse(content).body;
}

function parseSessionContent(content: string) {
  const parsed = markdownState.parse(content);
  return {
    body: parsed.body,
    state: ReadableSessionStateSchema.parse(migrateSessionState(parsed.data)),
  };
}

function toSessionDocument(
  basePath: string,
  sessionPath: string,
  content: string,
): SessionDocument {
  const parsed = parseSessionContent(content);
  return {
    basePath,
    sessionPath,
    content,
    body: parsed.body,
    state: parsed.state,
  };
}

function readActiveSession(projectRoot: any): SessionDocument {
  const basePath = resolveBasePath(projectRoot);
  const content = readState(ACTIVE_SESSION_REL, basePath);
  return toSessionDocument(
    basePath,
    resolveActiveSessionPath(basePath),
    content
  );
}

function readActiveSessionOrNull(projectRoot: any): SessionDocument | null {
  const basePath = resolveBasePath(projectRoot);
  const sessionPath = resolveActiveSessionPath(basePath);
  if (!fs.existsSync(sessionPath)) {
    return null;
  }
  const content = readState(ACTIVE_SESSION_REL, basePath);
  return toSessionDocument(basePath, sessionPath, content);
}

function writeActiveSession(basePath: any, state: any, body: any) {
  writeState(ACTIVE_SESSION_REL, serializeSessionState(state, body), basePath);
}

function assertActiveSessionMatches(state: any, sessionId: any) {
  if (state.session_id !== sessionId) {
    throw new StateError(
      `Session mismatch: active session is '${state.session_id}', got '${sessionId}'`
    );
  }
}

function assertMutationOutcome<R>(outcome: unknown): asserts outcome is SessionMutation<R> {
  if (
    !outcome ||
    typeof outcome !== 'object' ||
    !Object.prototype.hasOwnProperty.call(outcome, 'response') ||
    !Object.prototype.hasOwnProperty.call(outcome, 'writeBack') ||
    typeof (outcome as { writeBack?: unknown }).writeBack !== 'boolean'
  ) {
    throw new StateError(
      'Session mutation must return { response, writeBack } with writeBack set to a boolean',
      { code: 'INVALID_SESSION_MUTATION' }
    );
  }
}

function applySessionMutation<R>(
  document: SessionDocument,
  mutate: (document: SessionDocument) => SessionMutation<R>,
): R {
  const outcome = mutate(document);
  assertMutationOutcome<R>(outcome);
  if (outcome.writeBack) {
    const body = Object.prototype.hasOwnProperty.call(outcome, 'body')
      ? outcome.body
      : document.body;
    writeActiveSession(document.basePath, document.state, body);
  }
  return outcome.response;
}

function archiveActiveSessionFile(basePath: any, sessionPath: any, sessionId: any) {
  const archivePath = path.join(basePath, 'state', 'archive', `${sessionId}.md`);
  fs.mkdirSync(path.dirname(archivePath), { recursive: true });
  fs.renameSync(sessionPath, archivePath);
  return archivePath;
}

const sessionStore: SessionStore = {
  resolveBasePath,
  read: readActiveSession,
  readOrNull: readActiveSessionOrNull,
  create(projectRoot, state, body) {
    const currentState = SessionStateSchema.parse(state);
    const basePath = resolveBasePath(projectRoot);
    writeActiveSession(basePath, currentState, body);
    return resolveActiveSessionPath(basePath);
  },
  update(projectRoot, sessionId, mutate) {
    assertSessionId(sessionId);
    const document = readActiveSession(projectRoot);
    assertActiveSessionMatches(document.state, sessionId);
    return applySessionMutation(document, mutate);
  },
  write(document, state, body = document.body) {
    writeActiveSession(document.basePath, state, body);
  },
  archive(document, sessionId) {
    return archiveActiveSessionFile(
      document.basePath,
      document.sessionPath,
      sessionId
    );
  },
};

function updateCurrentSession<R>(
  projectRoot: string,
  mutate: (document: SessionDocument) => SessionMutation<R>,
): R {
  return applySessionMutation(readActiveSession(projectRoot), mutate);
}

function readCurrentSession(projectRoot: any): SessionDocument {
  return sessionStore.read(projectRoot);
}

function readCurrentSessionOrNull(projectRoot: any): SessionDocument | null {
  return sessionStore.readOrNull(projectRoot);
}

function assertNoInProgressSession(projectRoot: any) {
  const session = sessionStore.readOrNull(projectRoot);
  if (!session) return;
  if (session.state.status === 'in_progress') {
    throw new StateError(
      `Active session '${session.state.session_id}' already exists (status: in_progress). Archive it first with archive_session.`
    );
  }
}

function writeNewActiveSession(projectRoot: any, state: SessionState, body: any) {
  return sessionStore.create(projectRoot, state, body);
}

function withSessionState(projectRoot: any, mutator: any) {
  const session = readActiveSession(projectRoot);
  const outcome = mutator(session) || {};

  if (outcome.writeBack) {
    const body = Object.prototype.hasOwnProperty.call(outcome, 'body')
      ? outcome.body
      : extractBody(session.content);
    writeActiveSession(session.basePath, session.state, body);
  }

  return outcome.response;
}

function createPendingPhaseProgress() {
  return {
    started: null,
    completed: null,
    files_created: [],
    files_modified: [],
    files_deleted: [],
    downstream_context: createEmptyDownstreamContext(),
    errors: [],
    retry_count: 0,
    blocker_count: 0,
    review_finding_count: 0,
  };
}

function assertValidActiveSession(
  projectRoot: any,
  sessionId: any,
): SessionDocument {
  assertSessionId(sessionId);
  const session = readActiveSession(projectRoot);
  assertActiveSessionMatches(session.state, sessionId);
  return session;
}

function withValidatedSession(projectRoot: any, sessionId: any, mutator: any) {
  assertSessionId(sessionId);
  return withSessionState(projectRoot, (session: SessionDocument) => {
    assertActiveSessionMatches(session.state, sessionId);
    return mutator(session);
  });
}

function extractFileManifest(params: any) {
  const arr = (field: any) => params[field] ?? [];
  const filesCreated = arr('files_created');
  const filesModified = arr('files_modified');
  const filesDeleted = arr('files_deleted');
  return {
    filesCreated,
    filesModified,
    filesDeleted,
    hasFiles: filesCreated.length > 0 || filesModified.length > 0 || filesDeleted.length > 0,
  };
}

export {
  archiveActiveSessionFile,
  assertActiveSessionMatches,
  assertNoInProgressSession,
  assertValidActiveSession,
  createPendingPhaseProgress,
  extractBody,
  extractFileManifest,
  parseSessionState,
  readActiveSession,
  readActiveSessionOrNull,
  readCurrentSession,
  readCurrentSessionOrNull,
  resolveActiveSessionPath,
  resolveBasePath,
  serializeSessionState,
  sessionStore,
  updateCurrentSession,
  withSessionState,
  withValidatedSession,
  writeActiveSession,
  writeNewActiveSession,
};
export type { SessionDocument, SessionMutation, SessionStore };
