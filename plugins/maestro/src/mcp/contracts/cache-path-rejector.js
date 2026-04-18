'use strict';

const path = require('node:path');

const CACHE_PATH_SEGMENTS = [
  path.join('.codex', 'plugins'),
  path.join('.claude', 'plugins'),
  path.join('.gemini', 'extensions'),
];

function segmentWindows(segments, size) {
  const windows = [];
  for (let i = 0; i <= segments.length - size; i += 1) {
    windows.push(segments.slice(i, i + size).join(path.sep));
  }
  return windows;
}

/**
 * Returns true when the given path falls inside a host extension cache directory.
 * Matches on contiguous two-segment windows so that substring-only matches
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
  const windows = segmentWindows(segments, 2);
  return CACHE_PATH_SEGMENTS.some((cacheSegment) => windows.includes(cacheSegment));
}

module.exports = { CACHE_PATH_SEGMENTS, isExtensionCachePath };
