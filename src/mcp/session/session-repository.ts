import fs from 'fs';
import path from 'path';
import { StateError } from '../../lib/errors/index.js';
import {
  assertValidActiveSession,
  extractBody,
  parseSessionState,
  readActiveSession,
  readActiveSessionOrNull,
  resolveActiveSessionPath,
  resolveBasePath,
  withSessionState,
  withValidatedSession,
  writeActiveSession,
} from '../handlers/session-state-core.js';

function readCurrentSession(projectRoot: any) {
  return readActiveSession(projectRoot);
}

function readCurrentSessionOrNull(projectRoot: any) {
  return readActiveSessionOrNull(projectRoot);
}

function assertNoInProgressSession(projectRoot: any) {
  const session = readCurrentSessionOrNull(projectRoot);
  if (!session) return;
  if (session.state.status === 'in_progress') {
    throw new StateError(
      `Active session '${session.state.session_id}' already exists (status: in_progress). Archive it first with archive_session.`
    );
  }
}

function writeNewActiveSession(projectRoot: any, state: any, body: any) {
  const basePath = resolveBasePath(projectRoot);
  writeActiveSession(basePath, state, body);
  return resolveActiveSessionPath(basePath);
}

function archiveActiveSessionFile(basePath: any, sessionPath: any, sessionId: any) {
  const archivePath = path.join(
    basePath,
    'state',
    'archive',
    `${sessionId}.md`
  );
  fs.mkdirSync(path.dirname(archivePath), { recursive: true });
  fs.renameSync(sessionPath, archivePath);
  return archivePath;
}

export {
  archiveActiveSessionFile,
  assertNoInProgressSession,
  assertValidActiveSession,
  extractBody,
  parseSessionState,
  readCurrentSession,
  readCurrentSessionOrNull,
  withSessionState,
  withValidatedSession,
  writeActiveSession,
  writeNewActiveSession,
};
