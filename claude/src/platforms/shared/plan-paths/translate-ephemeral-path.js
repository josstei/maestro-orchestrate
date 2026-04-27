'use strict';

const path = require('node:path');
const os = require('node:os');

/**
 * Plan-mode ephemeral path translator.
 *
 * Some runtimes (Gemini, Qwen) confine plan-mode writes to an ephemeral tmp
 * directory under the user's home (e.g. `~/.gemini/tmp/<uuid>/`). The MCP
 * server must detect such paths so it can copy the document into the
 * canonical `<state_dir>/plans/` location *before* the runtime cleans up its
 * tmp dir — otherwise `create_session` later finds the file gone.
 *
 * Knowledge of which roots are ephemeral lives with each runtime, declared in
 * `runtime-config.planMode.ephemeralWriteRoots`. This module discovers those
 * declarations at load time so adding a new runtime is a config-only change.
 */

const RUNTIME_NAMES = Object.freeze(['claude', 'codex', 'gemini', 'qwen']);

/**
 * Load every declared ephemeral root from per-runtime configs. Returns a
 * frozen list of `{ runtime, segments }` entries; segments are home-relative
 * path components (e.g. `['.gemini', 'tmp']`). Runtimes whose config cannot be
 * loaded or that declare no ephemeral roots contribute nothing to the list.
 *
 * @returns {ReadonlyArray<{ runtime: string, segments: ReadonlyArray<string> }>}
 */
function loadEphemeralRoots() {
  const roots = [];
  for (const runtime of RUNTIME_NAMES) {
    let config;
    try {
      // eslint-disable-next-line global-require
      config = require(`../../${runtime}/runtime-config`);
    } catch {
      continue;
    }
    const declared =
      config &&
      config.planMode &&
      Array.isArray(config.planMode.ephemeralWriteRoots)
        ? config.planMode.ephemeralWriteRoots
        : [];
    for (const entry of declared) {
      if (
        entry &&
        Array.isArray(entry.homeRelative) &&
        entry.homeRelative.length > 0 &&
        entry.homeRelative.every((s) => typeof s === 'string' && s.length > 0)
      ) {
        roots.push(
          Object.freeze({
            runtime,
            segments: Object.freeze([...entry.homeRelative]),
          })
        );
      }
    }
  }
  return Object.freeze(roots);
}

const EPHEMERAL_ROOTS = loadEphemeralRoots();

/**
 * True when `absolute` equals `root` or sits beneath it. Uses path-segment
 * comparison (not String.includes) so an interior segment that happens to
 * spell `.gemini/tmp` cannot spuriously match.
 *
 * @param {string} absolute - resolved absolute path
 * @param {string} root - resolved absolute root path
 * @returns {boolean}
 */
function isUnderRoot(absolute, root) {
  if (absolute === root) return true;
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  return absolute.startsWith(rootWithSep);
}

/**
 * Detect whether a plan/design-document path lives under a runtime's ephemeral
 * write root. Pure: does not read the filesystem, does not check existence.
 * Callers handle materialization based on the result.
 *
 * @param {string} planPath - absolute or relative path emitted by a runtime
 * @param {object} [options]
 * @param {string} [options.home] - override `os.homedir()` (test seam)
 * @param {ReadonlyArray<{ runtime: string, segments: ReadonlyArray<string> }>} [options.roots] - override loaded roots (test seam)
 * @returns {{ isEphemeral: boolean, runtime: string | null, absolute: string }}
 */
function translateEphemeralPath(planPath, options = {}) {
  if (typeof planPath !== 'string' || planPath.length === 0) {
    return { isEphemeral: false, runtime: null, absolute: planPath };
  }
  const home = typeof options.home === 'string' && options.home.length > 0
    ? options.home
    : os.homedir();
  const roots = Array.isArray(options.roots) ? options.roots : EPHEMERAL_ROOTS;
  const absolute = path.isAbsolute(planPath)
    ? path.normalize(planPath)
    : path.resolve(home, planPath);

  for (const entry of roots) {
    const root = path.join(home, ...entry.segments);
    if (isUnderRoot(absolute, root)) {
      return { isEphemeral: true, runtime: entry.runtime, absolute };
    }
  }
  return { isEphemeral: false, runtime: null, absolute };
}

module.exports = {
  translateEphemeralPath,
  EPHEMERAL_ROOTS,
  loadEphemeralRoots,
};
