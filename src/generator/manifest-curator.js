'use strict';

/**
 * Collect every output path a generation run is expected to produce.
 *
 * Combines manifest-entry outputs with entry-point expander outputs so callers
 * (e.g. the stale-pruner) can reason about the full artifact surface without
 * re-implementing the expander iteration.
 *
 * @param {Array<{ outputs: Record<string, string> }>} manifest - Expanded manifest entries
 * @param {Record<string, object>} runtimes - Runtime configs keyed by name
 * @param {string} srcDir - Absolute path to the source directory
 * @param {Array<Function>} entryPointExpanders - Expander fns, each (runtimeName, srcDir) => [{ outputPath }, ...]
 * @returns {Set<string>} All output paths produced by this run
 */
function collectManifestPaths(manifest, runtimes, srcDir, entryPointExpanders) {
  const paths = new Set();
  for (const entry of manifest) {
    for (const p of Object.values(entry.outputs)) paths.add(p);
  }
  for (const fn of entryPointExpanders) {
    for (const rt of Object.keys(runtimes)) {
      for (const { outputPath } of fn(rt, srcDir)) paths.add(outputPath);
    }
  }
  return paths;
}

module.exports = {
  collectManifestPaths,
};
