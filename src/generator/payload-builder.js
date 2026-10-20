'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { VERSION_JSON_FILENAME } = require('../core/version');
const { formatJson, writeIfChanged } = require('../lib/io');
const { globFiles } = require('./glob-files');
const { pruneStaleFiles } = require('./stale-pruner');

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
  'platforms/runtime-config-map.js',
  'platforms/shared/',
  'state/',
  'agents/',
  'skills/',
  'references/',
  'templates/',
  'generated/',
]);

/**
 * src/ prefixes a runtime's payload carries beyond the base allowlist and its
 * platform dir. Antigravity serves the script-based state contract rooted at
 * its installed plugin dir (`${PLUGIN_ROOT}/src/scripts/...`), so its payload
 * ships the state scripts.
 * @type {Readonly<Record<string, ReadonlyArray<string>>>}
 */
const RUNTIME_PAYLOAD_EXTRAS = Object.freeze({
  antigravity: Object.freeze(['scripts/']),
});

/**
 * Build a payload allowlist for a specific runtime by extending the base
 * allowlist with that runtime's platform dir (its runtime config plus any
 * runtime-specific modules such as a hook adapter) and any
 * RUNTIME_PAYLOAD_EXTRAS entries.
 * @param {string} runtimeName
 * @returns {string[]}
 */
function buildPayloadAllowlist(runtimeName) {
  return [
    ...DETACHED_PAYLOAD_BASE_ALLOWLIST,
    `platforms/${runtimeName}/`,
    ...(RUNTIME_PAYLOAD_EXTRAS[runtimeName] || []),
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
 * @param {string} runtimeName - Runtime whose platform dir the payload carries
 * @param {string} version - Package version to stamp into version.json
 * @returns {{ copied: number, removed: number }} copied counts updated source
 *   files only; version.json is not counted
 */
function buildDetachedPayload(srcDir, outputDir, runtimeName, version) {
  const allowlist = buildPayloadAllowlist(runtimeName);
  const keptOutputs = new Set([VERSION_JSON_FILENAME]);
  let copied = 0;

  for (const relativePath of globFiles(srcDir, '**/*')) {
    if (!shouldIncludeInPayload(relativePath, allowlist)) {
      continue;
    }

    keptOutputs.add(relativePath);
    const content = fs.readFileSync(path.join(srcDir, relativePath), 'utf8');
    if (writeIfChanged(path.join(outputDir, relativePath), content)) {
      copied++;
    }
  }

  writeIfChanged(path.join(outputDir, VERSION_JSON_FILENAME), formatJson({ version }));

  const removed = pruneStaleFiles({
    rootDir: outputDir,
    manifestPaths: keptOutputs,
    ownedDirs: [''],
  }).length;
  return { copied, removed };
}

module.exports = {
  DETACHED_PAYLOAD_BASE_ALLOWLIST,
  RUNTIME_PAYLOAD_EXTRAS,
  buildPayloadAllowlist,
  shouldIncludeInPayload,
  buildDetachedPayload,
};
