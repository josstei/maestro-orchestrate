'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { isAdapterFile, extractRuntime } = require('../platforms/shared/adapters/conventions');

const VERSION_JSON_FILENAME = 'version.json';

const ADAPTER_PATH_PREFIX = 'platforms/shared/adapters/';

/**
 * Determine whether a relative path is an adapter file belonging to a
 * different runtime. Returns true when the file is a foreign adapter that
 * should be excluded from the payload.
 * @param {string} relativePath - Posix-style relative path from src/
 * @param {string} runtimeName - Target runtime name
 * @returns {boolean}
 */
function isForeignAdapter(relativePath, runtimeName) {
  if (!relativePath.startsWith(ADAPTER_PATH_PREFIX)) {
    return false;
  }
  const filename = relativePath.slice(ADAPTER_PATH_PREFIX.length);
  if (!isAdapterFile(filename)) {
    return false;
  }
  return extractRuntime(filename) !== runtimeName;
}

/**
 * Base allowlist of src/ prefixes included in detached payloads.
 * Each entry is a directory prefix (trailing slash) or a specific file path.
 * @type {ReadonlyArray<string>}
 */
const DETACHED_PAYLOAD_BASE_ALLOWLIST = Object.freeze([
  'core/',
  'lib/',
  'config/',
  'hooks/',
  'mcp/',
  'platforms/shared/',
  'state/',
  'agents/',
  'skills/',
  'references/',
  'templates/',
  'entry-points/',
  'generated/',
]);

/**
 * Per-runtime files that ship inside each detached payload. These are the
 * source-of-truth filenames at `src/platforms/<runtime>/<file>` that
 * `runtime-config.js` may require directly. Adding a new per-runtime
 * surface (e.g. a future `tracing-adapter.js`) is one line here.
 * @type {ReadonlyArray<string>}
 */
const RUNTIME_PAYLOAD_FILES = Object.freeze([
  'runtime-config.js',
  'telemetry-adapter.js',
]);

/**
 * Build a payload allowlist for a specific runtime by extending the base
 * allowlist with the per-runtime file entries.
 * @param {string} runtimeName
 * @returns {string[]}
 */
function buildPayloadAllowlist(runtimeName) {
  return [
    ...DETACHED_PAYLOAD_BASE_ALLOWLIST,
    ...RUNTIME_PAYLOAD_FILES.map(
      (filename) => `platforms/${runtimeName}/${filename}`
    ),
  ];
}

/**
 * Determine whether a file at the given relative path should be included
 * in a detached payload based on the provided allowlist.
 * @param {string} relativePath - Posix-style relative path from src/
 * @param {string[]} [allowlist] - Allowlist to check against; defaults to base
 * @returns {boolean}
 */
function shouldIncludeInPayload(relativePath, allowlist) {
  const list = allowlist || DETACHED_PAYLOAD_BASE_ALLOWLIST;
  return list.some((prefix) => relativePath.startsWith(prefix));
}

/**
 * Determine whether a directory walk should descend into the given directory.
 * Returns true when the directory is either a parent of an allowlisted prefix
 * or a child within an allowlisted prefix.
 * @param {string} relativeDir - Posix-style relative directory path from src/
 * @param {string[]} [allowlist] - Allowlist to check against; defaults to base
 * @returns {boolean}
 */
function shouldDescendInto(relativeDir, allowlist) {
  const dir = relativeDir.endsWith('/') ? relativeDir : `${relativeDir}/`;
  const list = allowlist || DETACHED_PAYLOAD_BASE_ALLOWLIST;
  return list.some(
    (prefix) => prefix.startsWith(dir) || dir.startsWith(prefix)
  );
}

/**
 * Walk srcDir, copy allowed files into outputDir, then remove stale files
 * from outputDir that are no longer present in the source.
 * @param {string} srcDir - Absolute path to the source directory
 * @param {string} outputDir - Absolute path to the output payload directory
 * @param {string} [runtimeName] - Runtime name for allowlist extension
 * @returns {{ copied: number, removed: number, skipped: number }}
 */
function buildDetachedPayload(srcDir, outputDir, runtimeName) {
  const allowlist = runtimeName
    ? buildPayloadAllowlist(runtimeName)
    : [...DETACHED_PAYLOAD_BASE_ALLOWLIST];
  const stats = { copied: 0, removed: 0, skipped: 0 };
  const keptOutputs = new Set();

  function walkAndCopy(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path
        .relative(srcDir, fullPath)
        .split(path.sep)
        .join('/');

      if (entry.isDirectory()) {
        if (shouldDescendInto(relativePath, allowlist)) {
          walkAndCopy(fullPath);
        } else {
          stats.skipped++;
        }
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (!shouldIncludeInPayload(relativePath, allowlist)) {
        stats.skipped++;
        continue;
      }

      if (runtimeName && isForeignAdapter(relativePath, runtimeName)) {
        stats.skipped++;
        continue;
      }

      keptOutputs.add(relativePath);
      const outputPath = path.join(outputDir, relativePath);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      const content = fs.readFileSync(fullPath, 'utf8');
      const existing = fs.existsSync(outputPath)
        ? fs.readFileSync(outputPath, 'utf8')
        : null;
      if (existing !== content) {
        fs.writeFileSync(outputPath, content, 'utf8');
        stats.copied++;
      }
    }
  }

  function cleanStale(dir) {
    if (!fs.existsSync(dir)) {
      return;
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path
        .relative(outputDir, fullPath)
        .split(path.sep)
        .join('/');
      if (entry.isDirectory()) {
        cleanStale(fullPath);
        if (
          fs.existsSync(fullPath) &&
          fs.readdirSync(fullPath).length === 0
        ) {
          fs.rmdirSync(fullPath);
        }
      } else if (!keptOutputs.has(relativePath)) {
        fs.unlinkSync(fullPath);
        stats.removed++;
      }
    }
  }

  walkAndCopy(srcDir);
  if (runtimeName) {
    keptOutputs.add(VERSION_JSON_FILENAME);
  }
  cleanStale(outputDir);
  return stats;
}

/**
 * Write a version.json file to each payload directory.
 * Only writes when the content has changed (avoids unnecessary churn).
 * @param {string[]} payloadDirs - Absolute paths to payload output directories
 * @param {string} version - Semantic version string to stamp
 */
function stampVersion(payloadDirs, version) {
  const versionContent = JSON.stringify({ version }, null, 2) + '\n';

  for (const payloadDir of payloadDirs) {
    const versionPath = path.join(payloadDir, VERSION_JSON_FILENAME);
    const existingContent = fs.existsSync(versionPath)
      ? fs.readFileSync(versionPath, 'utf8')
      : null;

    if (existingContent !== versionContent) {
      fs.writeFileSync(versionPath, versionContent, 'utf8');
    }
  }
}

module.exports = {
  DETACHED_PAYLOAD_BASE_ALLOWLIST,
  RUNTIME_PAYLOAD_FILES,
  buildPayloadAllowlist,
  shouldIncludeInPayload,
  isForeignAdapter,
  shouldDescendInto,
  buildDetachedPayload,
  stampVersion,
};
