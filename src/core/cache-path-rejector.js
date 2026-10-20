'use strict';

const path = require('node:path');

const CACHE_DIRS = [
  ['.codex', 'plugins'],
  ['.claude', 'plugins'],
  // Antigravity installs plugins to ~/.gemini/config/plugins/<name>/ and
  // links its older ~/.gemini/antigravity-cli/plugins/ location there.
  ['.gemini', 'config', 'plugins'],
  ['.gemini', 'antigravity-cli', 'plugins'],
];

/**
 * Returns true when the given path falls inside a host extension cache directory.
 * Matches whole contiguous path segments so that substring-only matches
 * (e.g. `.codex-plugins-research`) are correctly distinguished from genuine cache directories and not misclassified as cache paths.
 *
 * @param {string} candidate - Filesystem path. Absolute paths are used as-is; relative paths are resolved against process.cwd(), so callers should pass absolute paths for deterministic behavior.
 * @returns {boolean}
 */
function isExtensionCachePath(candidate) {
  const segments = path
    .resolve(candidate)
    .split(path.sep)
    .filter((segment) => segment.length > 0);
  return CACHE_DIRS.some((window) =>
    segments.some((_, start) => window.every((part, offset) => segments[start + offset] === part))
  );
}

module.exports = { isExtensionCachePath };
