'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { collectFiles, patternToRegex } = require('../lib/discovery');
const { toNamingConvention } = require('../lib/naming');
const { resolve: resolveTransform } = require('./transforms');

const FORBIDDEN_OUTPUTS = [
  'mcp/maestro-server-core.js',
  'claude/mcp/maestro-server-core.js',
  'plugins/maestro/mcp/maestro-server-core.js',
];

const FORBIDDEN_OUTPUT_PREFIXES = ['lib/', 'claude/lib/', 'plugins/maestro/lib/'];

/**
 * Expand a glob pattern relative to srcDir.
 * `*` is a wildcard within the final (file name) segment only; a `**` segment
 * directly before it also matches files in any subdirectory. Every other
 * segment is a literal directory name.
 * Returns sorted relative paths (platform separators).
 * @param {string} pattern - Glob pattern to expand
 * @param {string} srcDir - Absolute path to source directory
 * @returns {string[]} Sorted array of matched relative paths
 * @throws {Error} When the final segment is `**` or a directory segment
 *   contains `*`
 */
function expandGlob(pattern, srcDir) {
  const segments = pattern.split('/');
  const fileName = segments.pop();
  const recursive = segments[segments.length - 1] === '**';
  if (recursive) segments.pop();
  if (fileName === '**' || segments.some((segment) => segment.includes('*'))) {
    throw new Error(`Unsupported manifest glob: ${pattern}`);
  }

  const fileRegex = patternToRegex(fileName);
  return collectFiles(path.join(srcDir, ...segments), recursive)
    .filter((filePath) => fileRegex.test(path.basename(filePath)))
    .map((filePath) => path.relative(srcDir, filePath))
    .sort();
}

/**
 * Compute the output path for a source-relative path in a given runtime:
 * flatten skills/shared/, snake_case agent filenames for snake_case runtimes,
 * then prepend outputDir unless it is absent or './'.
 * @param {string} srcRelPath - Source-relative path
 * @param {{ agentNaming?: string, outputDir?: string }} runtime - Runtime configuration
 * @returns {string} Computed output path
 */
function computeOutputPath(srcRelPath, runtime) {
  let outPath = srcRelPath;

  if (outPath.startsWith('skills/shared/')) {
    outPath = 'skills/' + outPath.slice('skills/shared/'.length);
  }

  if (outPath.startsWith('agents/')) {
    outPath = path.dirname(outPath) + '/' + toNamingConvention(path.basename(outPath), runtime.agentNaming);
  }

  if (!runtime.outputDir || runtime.outputDir === './') {
    return outPath;
  }

  return runtime.outputDir + outPath;
}

/**
 * Validate that no manifest entries produce forbidden output paths.
 * Throws if any entry targets a path reserved for src-first mode.
 * @param {Array<{ outputs: Record<string, string> }>} manifest - Expanded manifest entries
 */
function assertNoMirroredSharedOutputs(manifest) {
  for (const entry of manifest) {
    for (const outputPath of Object.values(entry.outputs)) {
      if (
        FORBIDDEN_OUTPUTS.includes(outputPath) ||
        FORBIDDEN_OUTPUT_PREFIXES.some((prefix) => outputPath.startsWith(prefix))
      ) {
        throw new Error(`Manifest output is not allowed in src-first mode: "${outputPath}"`);
      }
    }
  }
}

/**
 * Expand convention-based manifest rules into explicit entries.
 *
 * Two rule formats:
 *   1. Explicit src + runtimes: has `src` and `runtimes` (no `glob`) -- expands to outputs per runtime
 *   2. Glob: has `glob` and `runtimes` -- scans srcDir, produces one entry per matched file
 *
 * Does NOT merge entries for the same source file -- different rules may have different transforms.
 * @param {Array<Object>} rules - Manifest rules to expand
 * @param {Record<string, Object>} runtimes - Runtime configurations keyed by name
 * @param {string} srcDir - Absolute path to source directory
 * @returns {Array<{ src: string, transforms: string[], outputs: Record<string, string> }>}
 */
function expandManifest(rules, runtimes, srcDir) {
  const entries = [];

  for (const rule of rules) {
    if (!Array.isArray(rule.runtimes)) {
      throw new Error(`Manifest rule missing "runtimes": ${JSON.stringify(rule)}`);
    }
    if (!rule.glob && !rule.src) {
      throw new Error(`Manifest rule needs "glob" or "src": ${JSON.stringify(rule)}`);
    }

    const srcFiles = rule.glob ? expandGlob(rule.glob, srcDir) : [rule.src];

    for (const srcRelPath of srcFiles) {
      const outputs = {};
      for (const runtimeName of rule.runtimes) {
        outputs[runtimeName] = computeOutputPath(srcRelPath, runtimes[runtimeName]);
      }
      entries.push({
        src: srcRelPath,
        transforms: rule.transforms,
        outputs,
      });
    }
  }

  return entries;
}

/**
 * Render every output of the expanded manifest entries by running each
 * entry's transforms over its source file. Lazy, so a consumer that writes
 * each output as it is yielded keeps reads, writes and reported errors in
 * manifest order. A missing source or a failing transform is passed to
 * reportError and skipped; an unreadable source throws.
 * @param {Array<{ src: string, transforms: string[], outputs: Record<string, string> }>} manifest - Expanded manifest entries
 * @param {Record<string, Object>} runtimes - Runtime configurations keyed by name
 * @param {string} srcDir - Absolute path to source directory
 * @param {(message: string, error?: Error) => void} reportError - Logs and counts a non-fatal failure
 * @returns {Generator<{ outputPath: string, content: string }>}
 */
function* renderManifest(manifest, runtimes, srcDir, reportError) {
  for (const entry of manifest) {
    const srcPath = path.join(srcDir, entry.src);
    if (!fs.existsSync(srcPath)) {
      reportError(`Source not found: ${entry.src}`);
      continue;
    }

    const sourceContent = fs.readFileSync(srcPath, 'utf8');
    for (const [runtimeName, outputPath] of Object.entries(entry.outputs)) {
      const runtime = runtimes[runtimeName];
      let content = sourceContent;
      try {
        for (const transformName of entry.transforms) {
          const fn = resolveTransform(transformName);
          content = fn(content, runtime);
        }
      } catch (err) {
        reportError(`processing ${entry.src} -> ${outputPath}`, err);
        continue;
      }
      yield { outputPath, content };
    }
  }
}

module.exports = {
  expandGlob,
  computeOutputPath,
  assertNoMirroredSharedOutputs,
  expandManifest,
  renderManifest,
};
