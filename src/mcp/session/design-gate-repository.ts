import fs from 'fs';
import path from 'path';
import { atomicWriteSync } from '../../lib/io/index.js';
import { resolveStateDirPath } from '../../state/session-state.js';
import { attempt } from '../handlers/attempt.js';

const GATE_FILENAME = '.design-gate.json';

function gatePath(projectRoot: any, sessionId: any) {
  const stateDir = resolveStateDirPath(projectRoot);
  return path.join(stateDir, 'state', `${sessionId}${GATE_FILENAME}`);
}

function emptyGate(sessionId: any) {
  return {
    session_id: sessionId,
    entered_at: new Date().toISOString(),
    approved_at: null,
    design_document_path: null,
  };
}

function readGate(projectRoot: any, sessionId: any) {
  const filePath = gatePath(projectRoot, sessionId);
  if (!fs.existsSync(filePath)) return null;
  return attempt(() => JSON.parse(fs.readFileSync(filePath, 'utf8')), null);
}

function writeGate(projectRoot: any, sessionId: any, data: any) {
  const filePath = gatePath(projectRoot, sessionId);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  atomicWriteSync(filePath, JSON.stringify(data, null, 2));
}

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

function findOrphanedApprovedGates(projectRoot: any, currentSessionId: any) {
  return listApprovedGates(projectRoot).filter(
    (gate: any) => gate.session_id !== currentSessionId
  );
}

function hasDesignGate(projectRoot: any, sessionId: any) {
  return readGate(projectRoot, sessionId) !== null;
}

function removeDesignGate(projectRoot: any, sessionId: any) {
  const filePath = gatePath(projectRoot, sessionId);
  if (!fs.existsSync(filePath)) return null;
  fs.unlinkSync(filePath);
  return filePath;
}

export {
  GATE_FILENAME,
  emptyGate,
  findOrphanedApprovedGates,
  gatePath,
  hasDesignGate,
  listApprovedGates,
  readGate,
  removeDesignGate,
  writeGate,
};
