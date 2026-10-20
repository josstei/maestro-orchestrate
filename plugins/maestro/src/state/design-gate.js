'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { atomicWriteSync, readJsonSafe } = require('../lib/io');

/** Suffix of a session's gate file: `<state_dir>/state/<session_id>.design-gate.json`. */
const GATE_FILENAME = '.design-gate.json';

function gatePath(stateDir, sessionId) {
  return path.join(stateDir, 'state', `${sessionId}${GATE_FILENAME}`);
}

/**
 * @param {string} stateDir - Resolved state dir
 * @param {string} sessionId
 * @returns {{ session_id: string, entered_at: string | null, approved_at: string | null, design_document_path: string | null } | null} the session's gate, or null when it is missing or unreadable
 */
function readGate(stateDir, sessionId) {
  return readJsonSafe(gatePath(stateDir, sessionId));
}

function createGate(sessionId, enteredAt = null) {
  return {
    session_id: sessionId,
    entered_at: enteredAt,
    approved_at: null,
    design_document_path: null,
  };
}

/**
 * @param {string} stateDir - Resolved state dir
 * @param {string} sessionId
 * @param {object} gate
 */
function writeGate(stateDir, sessionId, gate) {
  const filePath = gatePath(stateDir, sessionId);
  // Missing ancestors get the default mode here; atomicWriteSync alone would make them 0o700.
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  atomicWriteSync(filePath, JSON.stringify(gate, null, 2));
}

/**
 * Remove a session's gate file. Called by archive_session so the gate doesn't
 * linger in state/ after the session is archived; otherwise a future session
 * reusing the same id would inherit a stale "already approved" gate.
 * @param {string} stateDir - Resolved state dir
 * @param {string} sessionId
 */
function removeGate(stateDir, sessionId) {
  const filePath = gatePath(stateDir, sessionId);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

/**
 * Ids of the sessions whose gate is approved, in directory order. Missing,
 * corrupt and unapproved gate files are skipped; detection is best-effort.
 * @param {string} stateDir - Resolved state dir
 * @returns {string[]}
 */
function approvedGateSessionIds(stateDir) {
  const gateDir = path.join(stateDir, 'state');
  let entries;
  try {
    entries = fs.readdirSync(gateDir);
  } catch {
    return [];
  }
  const sessionIds = [];
  for (const entry of entries) {
    const sessionId = entry.slice(0, -GATE_FILENAME.length);
    if (!entry.endsWith(GATE_FILENAME) || sessionId.length === 0) continue;
    const gate = readJsonSafe(path.join(gateDir, entry));
    if (typeof gate?.approved_at === 'string' && gate.approved_at !== '') {
      sessionIds.push(sessionId);
    }
  }
  return sessionIds;
}

module.exports = {
  GATE_FILENAME,
  readGate,
  createGate,
  writeGate,
  removeGate,
  approvedGateSessionIds,
};
