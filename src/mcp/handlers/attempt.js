/**
 * Run a best-effort computation, returning a fallback on any throw. The
 * single named lenient-read / best-effort-swallow primitive for the handler
 * layer: readdir-or-empty, parse-or-null, stat-or-skip, record-or-ignore.
 * The body is deliberately try/catch (never `fn() || fallback`) so a
 * legitimately-falsy successful result is passed through, not replaced.
 *
 * @template T
 * @param {() => T} fn
 * @param {T} [fallback]
 * @returns {T|undefined}
 */
function attempt(fn, fallback) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export { attempt };
