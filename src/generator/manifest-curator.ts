import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GeneratedOutput, GeneratorRuntimeMap, ManifestEntry } from './types.js';

const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirname = path.dirname(moduleFilename);
const DEFAULT_CODE_SRC = path.resolve(moduleDirname, '..');

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
 * @param {Array<Function>} entryPointExpanders - Expander fns, each (runtimeName, srcDir, codeSrcDir) => [{ outputPath }, ...]
 * @param {string} [codeSrcDir] Absolute path to executable source/compiled-source modules
 * @returns {Set<string>} All output paths produced by this run
 */
type EntryPointExpander = (
  runtimeName: string,
  srcDir: string,
  codeSrcDir: string
) => Promise<GeneratedOutput[]> | GeneratedOutput[];

async function collectManifestPaths(
  manifest: ManifestEntry[],
  runtimes: GeneratorRuntimeMap,
  srcDir: string,
  entryPointExpanders: EntryPointExpander[],
  codeSrcDir = DEFAULT_CODE_SRC
): Promise<Set<string>> {
  const paths = new Set<string>();
  for (const entry of manifest) {
    for (const p of Object.values(entry.outputs)) paths.add(p);
  }
  for (const fn of entryPointExpanders) {
    for (const rt of Object.keys(runtimes)) {
      for (const { outputPath } of await fn(rt, srcDir, codeSrcDir)) paths.add(outputPath);
    }
  }
  return paths;
}

export { collectManifestPaths };
