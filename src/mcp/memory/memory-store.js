'use strict';

const fs = require('fs');
const path = require('path');

const markdownState = require('../../core/markdown-state');
const { atomicWriteSync } = require('../../lib/io');
const { resolveStateDirPath } = require('../../state/session-state');

const PROFILE_SCHEMA_VERSION = 1;
const PROFILE_ARRAY_FIELDS = Object.freeze([
  'build_commands',
  'test_commands',
  'lint_commands',
  'conventions',
  'do_not_touch',
  'preferred_agents',
  'blocked_agents',
]);
const PROFILE_BODY = '# Project Memory Profile\n';

/**
 * Build a fresh, empty profile at the current schema version.
 * @returns {object}
 */
function emptyProfile() {
  const profile = { schema_version: PROFILE_SCHEMA_VERSION };
  for (const field of PROFILE_ARRAY_FIELDS) {
    profile[field] = [];
  }
  profile.updated = null;
  return profile;
}

/**
 * Coerce an arbitrary value into a trimmed, de-duplicated, insertion-ordered
 * array of non-empty strings. Non-array input yields [].
 * @param {unknown} value
 * @returns {string[]}
 */
function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (trimmed.length === 0 || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

/**
 * Single facade over the durable, out-of-session memory files a repo owns:
 * `memory/project-profile.md`, `knowledge/agent-performance.json`, and
 * `knowledge/ratings.jsonl`. Each concern is a distinct method group. Built on
 * `resolveStateDirPath` + `atomicWriteSync` + `markdown-state`; no handler
 * touches these files directly.
 */
class MemoryStore {
  /**
   * @param {string} stateDir - resolved absolute state directory
   */
  constructor(stateDir) {
    this.stateDir = stateDir;
  }

  /**
   * @param {string} projectRoot
   * @returns {MemoryStore}
   */
  static forProjectRoot(projectRoot) {
    return new MemoryStore(resolveStateDirPath(projectRoot));
  }

  /**
   * @returns {string}
   */
  profilePath() {
    return path.join(this.stateDir, 'memory', 'project-profile.md');
  }

  /**
   * @returns {string}
   */
  agentPerformancePath() {
    return path.join(this.stateDir, 'knowledge', 'agent-performance.json');
  }

  /**
   * @returns {string}
   */
  ratingsPath() {
    return path.join(this.stateDir, 'knowledge', 'ratings.jsonl');
  }

  /**
   * Read the per-repo profile, returning a fresh empty profile when the file is
   * absent or unparseable. Array fields are normalized on read.
   * @returns {object}
   */
  readProfile() {
    let content;
    try {
      content = fs.readFileSync(this.profilePath(), 'utf8');
    } catch {
      return emptyProfile();
    }
    let data;
    try {
      data = markdownState.parse(content).data;
    } catch {
      return emptyProfile();
    }
    const profile = emptyProfile();
    profile.schema_version = PROFILE_SCHEMA_VERSION;
    for (const field of PROFILE_ARRAY_FIELDS) {
      profile[field] = normalizeStringArray(data[field]);
    }
    profile.updated = typeof data.updated === 'string' ? data.updated : null;
    return profile;
  }

  /**
   * Normalize, stamp (`schema_version` + `updated`), and atomically persist the
   * profile. Returns the canonical profile that was written.
   * @param {object} profile
   * @returns {object}
   */
  writeProfile(profile) {
    const source = profile && typeof profile === 'object' ? profile : {};
    const next = { schema_version: PROFILE_SCHEMA_VERSION };
    for (const field of PROFILE_ARRAY_FIELDS) {
      next[field] = normalizeStringArray(source[field]);
    }
    next.updated = new Date().toISOString();
    atomicWriteSync(this.profilePath(), markdownState.serialize(next, PROFILE_BODY));
    return next;
  }

  /**
   * @returns {object[]} durable agent-performance records ([] when absent/invalid)
   */
  readAgentPerformance() {
    let content;
    try {
      content = fs.readFileSync(this.agentPerformancePath(), 'utf8');
    } catch {
      return [];
    }
    try {
      const parsed = JSON.parse(content);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  /**
   * Append one agent-performance record to the durable JSON ledger.
   * @param {object} record
   * @returns {object} the appended record
   */
  appendAgentPerformance(record) {
    const records = this.readAgentPerformance();
    records.push(record);
    atomicWriteSync(this.agentPerformancePath(), JSON.stringify(records, null, 2));
    return record;
  }

  /**
   * @returns {object[]} parsed rating records ([] when absent), skipping bad lines
   */
  readRatings() {
    let content;
    try {
      content = fs.readFileSync(this.ratingsPath(), 'utf8');
    } catch {
      return [];
    }
    const out = [];
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      try {
        out.push(JSON.parse(trimmed));
      } catch {
        continue;
      }
    }
    return out;
  }

  /**
   * Append one rating record as a JSON line to the durable JSONL log.
   * @param {object} record
   * @returns {object} the appended record
   */
  appendRating(record) {
    const filePath = this.ratingsPath();
    let existing = '';
    try {
      existing = fs.readFileSync(filePath, 'utf8');
    } catch {
      existing = '';
    }
    atomicWriteSync(filePath, `${existing}${JSON.stringify(record)}\n`);
    return record;
  }
}

module.exports = {
  MemoryStore,
  PROFILE_SCHEMA_VERSION,
  PROFILE_ARRAY_FIELDS,
  emptyProfile,
};
