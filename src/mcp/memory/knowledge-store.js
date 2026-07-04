'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { resolveTypedSetting } = require('../../config/setting-resolver');
const { ValidationError } = require('../../lib/errors');
const { atomicWriteSync, readFileSafe } = require('../../lib/io');

const KNOWLEDGE_FILENAME = 'knowledge.jsonl';

/**
 * Expand the supported leading-home shorthand for a configured directory.
 *
 * @param {string} value
 * @returns {string}
 */
function expandHome(value) {
  if (value === '~') {
    return os.homedir();
  }
  if (value.startsWith('~/') || value.startsWith('~\\')) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}

/**
 * @param {fs.Stats} stats
 * @param {string} dir
 */
function validateOwnedDirectory(stats, dir) {
  if (!stats.isDirectory()) {
    throw new ValidationError('MAESTRO_KNOWLEDGE_DIR must resolve to a directory', {
      details: { dir },
    });
  }
  if (typeof process.getuid === 'function' && stats.uid !== process.getuid()) {
    throw new ValidationError('MAESTRO_KNOWLEDGE_DIR must be owned by the current user', {
      details: { dir },
    });
  }
}

/**
 * Enforce private directory permissions on platforms with POSIX modes.
 *
 * @param {string} dir
 * @param {fs.Stats} stats
 * @returns {fs.Stats}
 */
function ensurePrivateMode(dir, stats) {
  if (process.platform === 'win32') {
    return stats;
  }
  if ((stats.mode & 0o777) !== 0o700) {
    fs.chmodSync(dir, 0o700);
    stats = fs.lstatSync(dir);
  }
  if ((stats.mode & 0o777) !== 0o700) {
    throw new ValidationError('MAESTRO_KNOWLEDGE_DIR must have 0700 permissions', {
      details: { dir },
    });
  }
  return stats;
}

/**
 * @param {string} content
 * @returns {object[]}
 */
function parseJsonLines(content) {
  const records = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        records.push(parsed);
      }
    } catch {}
  }
  return records;
}

/**
 * Out-of-tree cross-project knowledge store. The configured directory is
 * independent of any workspace root and is validated as a private real
 * directory before `knowledge.jsonl` is read or written.
 */
class KnowledgeStore {
  /**
   * @param {string} projectRoot
   */
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
  }

  /**
   * @returns {string}
   * @throws {ValidationError}
   */
  resolveDir() {
    const configured = resolveTypedSetting('MAESTRO_KNOWLEDGE_DIR', this.projectRoot);
    const dir = path.resolve(expandHome(configured));
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    let stats = fs.lstatSync(dir);
    if (stats.isSymbolicLink()) {
      throw new ValidationError('MAESTRO_KNOWLEDGE_DIR must not be a symlink', {
        details: { dir },
      });
    }
    validateOwnedDirectory(stats, dir);
    stats = ensurePrivateMode(dir, stats);
    validateOwnedDirectory(stats, dir);
    return dir;
  }

  /**
   * @returns {string}
   */
  knowledgePath() {
    return path.join(this.resolveDir(), KNOWLEDGE_FILENAME);
  }

  /**
   * @param {object} record
   * @returns {object}
   */
  append(record) {
    const filePath = this.knowledgePath();
    const existing = readFileSafe(filePath, '');
    atomicWriteSync(filePath, `${existing}${JSON.stringify(record)}\n`);
    return record;
  }

  /**
   * @returns {object[]}
   */
  read() {
    return parseJsonLines(readFileSafe(this.knowledgePath(), ''));
  }
}

module.exports = {
  KnowledgeStore,
  KNOWLEDGE_FILENAME,
};
