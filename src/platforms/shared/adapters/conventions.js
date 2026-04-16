'use strict';

/** @type {string} */
const ADAPTER_SUFFIX = '-adapter.js';

/**
 * Determine whether a filename follows the adapter naming convention.
 * Accepts bare filenames only — paths with directory separators return false.
 * @param {string} filename - Base filename (no directory components)
 * @returns {boolean} True when filename matches the {runtime}-adapter.js pattern
 */
function isAdapterFile(filename) {
  return filename.endsWith(ADAPTER_SUFFIX) && !filename.includes('/');
}

/**
 * Extract the runtime name from an adapter filename.
 * @param {string} filename - Base filename matching the adapter convention
 * @returns {string|null} Runtime name (e.g. 'claude'), or null if filename
 *   does not match the adapter convention
 */
function extractRuntime(filename) {
  if (!isAdapterFile(filename)) {
    return null;
  }
  return filename.slice(0, -ADAPTER_SUFFIX.length);
}

module.exports = { ADAPTER_SUFFIX, isAdapterFile, extractRuntime };
