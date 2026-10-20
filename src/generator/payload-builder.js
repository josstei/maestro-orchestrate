'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { VERSION_JSON_FILENAME } = require('../core/version');
const { formatJson, writeIfChanged } = require('../lib/io');
const { globFiles } = require('./glob-files');
const { pruneStaleFiles } = require('./stale-pruner');

/**
 * src/ prefixes every detached payload ships: the MCP server, the modules it
 * loads and the content it serves. Each entry is a directory prefix (trailing
 * slash) or a file path.
 */
const BASE_PREFIXES = [
  'core/',
  'lib/',
  'config/',
  'mcp/',
  'platforms/runtime-config-map.js',
  'state/',
  'agents/',
  'skills/',
  'references/',
  'templates/',
  'generated/',
];

/**
 * The files of a runtime's platform dir that its host loads at run time; the
 * build-time outputs.js and templates/ stay out of the payload.
 */
const PLATFORM_RUNTIME_FILES = ['runtime-config.js', 'hook-adapter.js', 'policy-enforcer.js'];

/**
 * Copy the files of srcDir that one runtime's payload ships into outputDir,
 * stamp version.json, then remove stale files from outputDir that are no
 * longer present in the source.
 * @param {string} srcDir - Absolute path to the source directory
 * @param {string} outputDir - Absolute path to the output payload directory
 * @param {string} runtimeName - Runtime whose platform files the payload carries
 * @param {string[]} extraPrefixes - src/ prefixes the runtime ships beyond the
 *   base (its outputs.js `payload`)
 * @param {string} version - Package version to stamp into version.json
 * @returns {{ copied: number, removed: number }} copied counts updated source
 *   files only; version.json is not counted
 */
function buildDetachedPayload(srcDir, outputDir, runtimeName, extraPrefixes, version) {
  const prefixes = [
    ...BASE_PREFIXES,
    ...PLATFORM_RUNTIME_FILES.map((file) => `platforms/${runtimeName}/${file}`),
    ...extraPrefixes,
  ];
  const keptOutputs = new Set([VERSION_JSON_FILENAME]);
  let copied = 0;

  for (const relativePath of globFiles(srcDir, '**/*')) {
    if (!prefixes.some((prefix) => relativePath.startsWith(prefix))) {
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

module.exports = { buildDetachedPayload };
