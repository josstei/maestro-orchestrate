'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { extractRuntime } = require('../platforms/shared/adapters/conventions');
const { VERSION_JSON_FILENAME } = require('../core/version');
const { collectFiles } = require('../lib/discovery');
const { writeIfChanged } = require('../lib/io');
const { pruneStaleFiles } = require('./stale-pruner');

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
  const runtime = extractRuntime(relativePath.slice(ADAPTER_PATH_PREFIX.length));
  return runtime !== null && runtime !== runtimeName;
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
 * Build a payload allowlist for a specific runtime by extending the base
 * allowlist with the runtime-specific config file entry.
 * @param {string} runtimeName
 * @returns {string[]}
 */
function buildPayloadAllowlist(runtimeName) {
  return [
    ...DETACHED_PAYLOAD_BASE_ALLOWLIST,
    `platforms/${runtimeName}/runtime-config.js`,
  ];
}

/**
 * Determine whether a file at the given relative path should be included
 * in a detached payload based on the provided allowlist.
 * @param {string} relativePath - Posix-style relative path from src/
 * @param {string[]} allowlist - Allowlist to check against
 * @returns {boolean}
 */
function shouldIncludeInPayload(relativePath, allowlist) {
  return allowlist.some((prefix) => relativePath.startsWith(prefix));
}

/**
 * Copy the allowlisted files of srcDir for one runtime into outputDir, stamp
 * version.json, then remove stale files from outputDir that are no longer
 * present in the source.
 * @param {string} srcDir - Absolute path to the source directory
 * @param {string} outputDir - Absolute path to the output payload directory
 * @param {string} runtimeName - Runtime whose config file and adapter the payload carries
 * @param {string} version - Package version to stamp into version.json
 * @returns {{ copied: number, removed: number }} copied counts updated source
 *   files only; version.json is not counted
 */
function buildDetachedPayload(srcDir, outputDir, runtimeName, version) {
  const allowlist = buildPayloadAllowlist(runtimeName);
  const keptOutputs = new Set([VERSION_JSON_FILENAME]);
  let copied = 0;

  for (const filePath of collectFiles(srcDir, true)) {
    const relativePath = path.relative(srcDir, filePath).split(path.sep).join('/');
    if (!shouldIncludeInPayload(relativePath, allowlist) || isForeignAdapter(relativePath, runtimeName)) {
      continue;
    }

    keptOutputs.add(relativePath);
    const content = fs.readFileSync(filePath, 'utf8');
    if (writeIfChanged(path.join(outputDir, relativePath), content)) {
      copied++;
    }
  }

  writeIfChanged(
    path.join(outputDir, VERSION_JSON_FILENAME),
    JSON.stringify({ version }, null, 2) + '\n'
  );

  const removed = pruneStaleFiles({
    rootDir: outputDir,
    manifestPaths: keptOutputs,
    ownedDirs: [''],
  }).pruned.length;
  return { copied, removed };
}

module.exports = {
  DETACHED_PAYLOAD_BASE_ALLOWLIST,
  buildPayloadAllowlist,
  shouldIncludeInPayload,
  isForeignAdapter,
  buildDetachedPayload,
};
