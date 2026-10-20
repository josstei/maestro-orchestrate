'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { collectFiles, patternToRegex } = require('../lib/discovery');
const { toNamingConvention } = require('../lib/naming');

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
 * Expand the manifest rules into one entry per matched source file, with
 * that file's output path in each of the rule's runtimes.
 * @param {Array<{ glob: string, transform: Function, runtimes: string[] }>} rules - Manifest rules to expand
 * @param {Record<string, Object>} runtimes - Runtime configurations keyed by name
 * @param {string} srcDir - Absolute path to source directory
 * @returns {Array<{ src: string, transform: Function, outputs: Record<string, string> }>}
 */
function expandManifest(rules, runtimes, srcDir) {
  return rules.flatMap((rule) =>
    expandGlob(rule.glob, srcDir).map((src) => ({
      src,
      transform: rule.transform,
      outputs: Object.fromEntries(
        rule.runtimes.map((runtimeName) => [runtimeName, computeOutputPath(src, runtimes[runtimeName])])
      ),
    }))
  );
}

/**
 * Render every output of the expanded manifest entries by running each
 * entry's transform over its source file. Lazy, so a consumer that writes
 * each output as it is yielded keeps reads, writes and reported errors in
 * manifest order. A failing transform is passed to reportError and skipped;
 * an unreadable source throws.
 * @param {Array<{ src: string, transform: Function, outputs: Record<string, string> }>} manifest - Expanded manifest entries
 * @param {Record<string, Object>} runtimes - Runtime configurations keyed by name
 * @param {string} srcDir - Absolute path to source directory
 * @param {(message: string, error?: Error) => void} reportError - Logs and counts a non-fatal failure
 * @returns {Generator<{ outputPath: string, content: string }>}
 */
function* renderManifest(manifest, runtimes, srcDir, reportError) {
  for (const entry of manifest) {
    const sourceContent = fs.readFileSync(path.join(srcDir, entry.src), 'utf8');
    for (const [runtimeName, outputPath] of Object.entries(entry.outputs)) {
      let content;
      try {
        content = entry.transform(sourceContent, runtimes[runtimeName]);
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
  expandManifest,
  renderManifest,
};
