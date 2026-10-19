'use strict';

const path = require('node:path');

const CACHE_PATH_SEGMENTS = [
  path.join('.codex', 'plugins'),
  path.join('.claude', 'plugins'),
  // Antigravity installs plugins to ~/.gemini/config/plugins/<name>/ and
  // links its older ~/.gemini/antigravity-cli/plugins/ location there.
  path.join('.gemini', 'config', 'plugins'),
  path.join('.gemini', 'antigravity-cli', 'plugins'),
];

const CACHE_PATH_WINDOWS = CACHE_PATH_SEGMENTS.map((entry) => entry.split(path.sep));

/**
 * Returns true when the given path falls inside a host extension cache directory.
 * Matches whole contiguous path segments so that substring-only matches
 * (e.g. `.codex-plugins-research`) are correctly distinguished from genuine cache directories and not misclassified as cache paths.
 *
 * @param {string} candidate - Filesystem path. Absolute paths are used as-is; relative paths are resolved against process.cwd(), so callers should pass absolute paths for deterministic behavior.
 * @returns {boolean}
 */
function isExtensionCachePath(candidate) {
  if (typeof candidate !== 'string' || candidate.length === 0) {
    return false;
  }
  const segments = path
    .resolve(candidate)
    .split(path.sep)
    .filter((segment) => segment.length > 0);
  return CACHE_PATH_WINDOWS.some((window) =>
    segments.some((_, start) => window.every((part, offset) => segments[start + offset] === part))
  );
}

module.exports = { CACHE_PATH_SEGMENTS, isExtensionCachePath };
