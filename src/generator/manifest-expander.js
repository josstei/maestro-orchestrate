'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { toSnakeCase } = require('../lib/naming');

const FORBIDDEN_OUTPUTS = [
  'mcp/maestro-server-core.js',
  'claude/mcp/maestro-server-core.js',
  'plugins/maestro/mcp/maestro-server-core.js',
];

const FORBIDDEN_OUTPUT_PREFIXES = ['lib/', 'claude/lib/', 'plugins/maestro/lib/'];

/**
 * Expand a glob pattern relative to srcDir.
 * Supports `*` (wildcard within a single directory) and `**` (recursive).
 * Returns sorted relative paths (posix separators).
 * @param {string} pattern - Glob pattern to expand
 * @param {string} srcDir - Absolute path to source directory
 * @returns {string[]} Sorted array of matched relative paths
 */
function expandGlob(pattern, srcDir) {
  const segments = pattern.split('/');
  const results = [];

  function walk(dir, segIndex) {
    if (segIndex >= segments.length) return;

    const segment = segments[segIndex];
    const isLast = segIndex === segments.length - 1;

    if (segment === '**') {
      walk(dir, segIndex + 1);
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const entry of entries) {
        if (entry.isDirectory()) {
          walk(path.join(dir, entry.name), segIndex);
        }
      }
    } else {
      const re = new RegExp(
        '^' + segment.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*') + '$'
      );

      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const entry of entries) {
        if (!re.test(entry.name)) continue;

        const fullPath = path.join(dir, entry.name);
        if (isLast) {
          if (entry.isFile()) {
            results.push(path.relative(srcDir, fullPath));
          }
        } else {
          if (entry.isDirectory()) {
            walk(fullPath, segIndex + 1);
          }
        }
      }
    }
  }

  walk(srcDir, 0);
  return results.sort();
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

  if (outPath.startsWith('agents/') && runtime.agentNaming === 'snake_case') {
    outPath = path.dirname(outPath) + '/' + toSnakeCase(path.basename(outPath));
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

module.exports = {
  expandGlob,
  computeOutputPath,
  assertNoMirroredSharedOutputs,
  expandManifest,
};
