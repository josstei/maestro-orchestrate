'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { toNamingConvention } = require('../lib/naming');
const { globFiles } = require('./glob-files');

/**
 * Output path of a source file in one runtime: the source path under the
 * runtime's outputDir, with skills/shared/ flattened to skills/ and agent
 * file names in the runtime's naming convention.
 * @param {string} src - Posix path relative to the source directory
 * @param {{ agentNaming: string, outputDir: string }} runtime - Runtime configuration
 * @returns {string} Posix output path relative to the repo root
 */
function computeOutputPath(src, runtime) {
  let outPath = src.replace(/^skills\/shared\//, 'skills/');
  if (outPath.startsWith('agents/')) {
    outPath = path.posix.join(
      path.posix.dirname(outPath),
      toNamingConvention(path.posix.basename(outPath), runtime.agentNaming)
    );
  }
  return path.posix.join(runtime.outputDir, outPath);
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
    globFiles(srcDir, rule.glob).map((src) => ({
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

module.exports = { expandManifest, renderManifest };
