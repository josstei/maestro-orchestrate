import path from 'node:path';
import fs from 'node:fs';
import { toSnakeCase } from '../lib/naming/index.js';
import type { GeneratorRuntimeConfig, GeneratorRuntimeMap, ManifestEntry, ManifestRule } from './types.js';

/**
 * Expand a glob pattern relative to srcDir.
 * Supports `*` (wildcard within a single directory) and `**` (recursive).
 * Returns sorted relative paths (posix separators).
 * @param {string} pattern - Glob pattern to expand
 * @param {string} srcDir - Absolute path to source directory
 * @returns {string[]} Sorted array of matched relative paths
 */
function expandGlob(pattern: string, srcDir: string): string[] {
  const segments = pattern.split('/');
  const results: string[] = [];

  function walk(dir: string, segIndex: number): void {
    if (segIndex >= segments.length) return;

    const segment = segments[segIndex];
    if (!segment) return;
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
function normalizeSrcRelPath(srcRelPath: string, runtime: Pick<GeneratorRuntimeConfig, 'agentNaming'>): string {
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
function computeOutputPath(srcRelPath: string, runtime: Pick<GeneratorRuntimeConfig, 'agentNaming' | 'outputDir'>): string {
  return buildRuntimeOutputPath(runtime, normalizeSrcRelPath(srcRelPath, runtime));
}

/**
 * Prepend a runtime's outputDir to a relative path.
 * Skips prepending when outputDir is absent or './'.
 * @param {{ outputDir?: string }} runtime - Runtime configuration
 * @param {string} relativePath - Path to prepend to
 * @returns {string} Path with outputDir prepended
 */
function buildRuntimeOutputPath(runtime: Pick<GeneratorRuntimeConfig, 'outputDir'>, relativePath: string): string {
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
function assertNoMirroredSharedOutputs(manifest: Array<{ outputs: Record<string, string> }>): void {
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
function expandManifest(rules: ManifestRule[], runtimes: GeneratorRuntimeMap, srcDir: string): ManifestEntry[] {
  const entries: ManifestEntry[] = [];

  for (const rule of rules) {
    if (rule.outputs) {
      throw new Error(`Manifest legacy outputs rules are not supported: ${JSON.stringify(rule)}`);
    }

    if (!rule.runtimes || !Array.isArray(rule.runtimes)) {
      throw new Error(`Manifest rule missing "runtimes": ${JSON.stringify(rule)}`);
    }
    if (!rule.glob && !rule.src) {
      throw new Error(`Manifest rule needs "glob" or "src": ${JSON.stringify(rule)}`);
    }
    if (rule.preserveSourcePath || rule.outputBase) {
      throw new Error(
        `Manifest rule uses retired mirrored-output option: ${JSON.stringify(rule)}`
      );
    }

    let srcFiles: string[];
    if (rule.glob) {
      srcFiles = expandGlob(rule.glob, srcDir);
      if (rule.exclude) {
        const excludeSet = new Set(rule.exclude);
        srcFiles = srcFiles.filter((f) => !excludeSet.has(f));
      }
    } else {
      if (!rule.src) {
        throw new Error(`Manifest rule needs "src" when "glob" is absent: ${JSON.stringify(rule)}`);
      }
      srcFiles = [rule.src];
    }

    for (const srcRelPath of srcFiles) {
      const outputs: Record<string, string> = {};
      for (const runtimeName of rule.runtimes) {
        const runtime = runtimes[runtimeName];
        if (!runtime) {
          throw new Error(`Manifest rule references unknown runtime "${runtimeName}"`);
        }
        if (rule.outputName) {
          outputs[runtimeName] = buildRuntimeOutputPath(runtime, rule.outputName);
        } else {
          outputs[runtimeName] = computeOutputPath(srcRelPath, runtime);
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

export { expandGlob, normalizeSrcRelPath, computeOutputPath, buildRuntimeOutputPath, assertNoMirroredSharedOutputs, expandManifest };
