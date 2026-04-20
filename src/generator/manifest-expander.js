'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { toSnakeCase } = require('../lib/naming');

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
 * Apply the path-shape rewrites that differ per runtime but do NOT
 * prepend outputDir. Handles skills/shared flattening and snake_case
 * agent renaming.
 * @param {string} srcRelPath
 * @param {{ agentNaming?: string }} runtime
 * @returns {string}
 */
function normalizeSrcRelPath(srcRelPath, runtime) {
  let outPath = srcRelPath;

  if (outPath.startsWith('skills/shared/')) {
    outPath = 'skills/' + outPath.slice('skills/shared/'.length);
  }

  if (outPath.startsWith('agents/') && runtime.agentNaming === 'snake_case') {
    const dir = path.dirname(outPath);
    const base = path.basename(outPath);
    outPath = dir + '/' + toSnakeCase(base);
  }

  return outPath;
}

/**
 * Compute the output path for a source-relative path in a given runtime.
 * Composes the name-shape rewrites with outputDir prepending.
 * @param {string} srcRelPath - Source-relative path
 * @param {{ agentNaming?: string, outputDir?: string }} runtime - Runtime configuration
 * @returns {string} Computed output path
 */
function computeOutputPath(srcRelPath, runtime) {
  return buildRuntimeOutputPath(runtime, normalizeSrcRelPath(srcRelPath, runtime));
}

/**
 * Normalize an outputBase value for a given runtime.
 * Accepts string, per-runtime object, or null/undefined.
 * @param {string | Record<string, string> | null | undefined} outputBase - Base path specification
 * @param {string} runtimeName - Name of the target runtime
 * @returns {string} Normalized base path
 */
function normalizeOutputBase(outputBase, runtimeName) {
  if (!outputBase) {
    return '';
  }

  if (typeof outputBase === 'string') {
    return outputBase;
  }

  if (typeof outputBase === 'object') {
    return outputBase[runtimeName] || '';
  }

  throw new Error(`Invalid outputBase: ${JSON.stringify(outputBase)}`);
}

/**
 * Join a base path with a relative path using posix separators.
 * Returns the relative path unchanged when base is empty.
 * @param {string} base - Base path prefix
 * @param {string} relativePath - Path to append
 * @returns {string} Joined path
 */
function joinRelativePath(base, relativePath) {
  if (!base) {
    return relativePath;
  }

  return path.posix.join(base, relativePath);
}

/**
 * Prepend a runtime's outputDir to a relative path.
 * Skips prepending when outputDir is absent or './'.
 * @param {{ outputDir?: string }} runtime - Runtime configuration
 * @param {string} relativePath - Path to prepend to
 * @returns {string} Path with outputDir prepended
 */
function buildRuntimeOutputPath(runtime, relativePath) {
  if (!runtime.outputDir || runtime.outputDir === './') {
    return relativePath;
  }

  return runtime.outputDir + relativePath;
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
        outputPath === 'mcp/maestro-server-core.js' ||
        outputPath === 'claude/mcp/maestro-server-core.js' ||
        outputPath === 'plugins/maestro/mcp/maestro-server-core.js' ||
        outputPath === 'lib/mcp/generated/resource-registry.js' ||
        outputPath === 'plugins/maestro/lib/mcp/generated/resource-registry.js' ||
        outputPath === 'plugins/maestro/lib/mcp/generated/agent-registry.js' ||
        outputPath.startsWith('lib/') ||
        outputPath.startsWith('claude/lib/') ||
        outputPath.startsWith('plugins/maestro/lib/')
      ) {
        throw new Error(`Manifest output is not allowed in src-first mode: "${outputPath}"`);
      }
    }
  }
}

/**
 * Expand convention-based manifest rules into explicit entries.
 *
 * Three rule formats:
 *   1. Legacy: has `outputs` field -- passed through unchanged
 *   2. Explicit src + runtimes: has `src` and `runtimes` (no `glob`) -- expands to outputs per runtime
 *   3. Glob: has `glob` and `runtimes` -- scans srcDir, produces one entry per matched file
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
    if (rule.outputs) {
      entries.push(rule);
      continue;
    }

    if (!rule.runtimes || !Array.isArray(rule.runtimes)) {
      throw new Error(`Manifest rule missing "runtimes": ${JSON.stringify(rule)}`);
    }
    if (!rule.glob && !rule.src) {
      throw new Error(`Manifest rule needs "glob" or "src": ${JSON.stringify(rule)}`);
    }

    let srcFiles;
    if (rule.glob) {
      srcFiles = expandGlob(rule.glob, srcDir);
      if (rule.exclude) {
        const excludeSet = new Set(rule.exclude);
        srcFiles = srcFiles.filter((f) => !excludeSet.has(f));
      }
    } else {
      srcFiles = [rule.src];
    }

    for (const srcRelPath of srcFiles) {
      const outputs = {};
      for (const runtimeName of rule.runtimes) {
        const runtime = runtimes[runtimeName];
        if (rule.outputName) {
          outputs[runtimeName] = buildRuntimeOutputPath(runtime, rule.outputName);
        } else if (rule.preserveSourcePath) {
          const outputBase = normalizeOutputBase(rule.outputBase, runtimeName);
          outputs[runtimeName] = buildRuntimeOutputPath(
            runtime,
            joinRelativePath(outputBase, srcRelPath)
          );
        } else {
          const outputBase = normalizeOutputBase(rule.outputBase, runtimeName);
          outputs[runtimeName] = buildRuntimeOutputPath(
            runtime,
            joinRelativePath(outputBase, normalizeSrcRelPath(srcRelPath, runtime))
          );
        }
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
  normalizeSrcRelPath,
  computeOutputPath,
  normalizeOutputBase,
  joinRelativePath,
  buildRuntimeOutputPath,
  assertNoMirroredSharedOutputs,
  expandManifest,
};
