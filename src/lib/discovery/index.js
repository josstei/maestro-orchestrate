'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { readFileSafe } = require('../io');

/**
 * @typedef {Object} DiscoveryEntry
 * @property {string} id - Unique identifier derived by the identity function
 * @property {string} path - Absolute path to the discovered file
 */

/**
 * @typedef {Object} DiscoverOptions
 * @property {string} dir - Absolute path to the directory to scan
 * @property {string} pattern - File-matching pattern (e.g., '*.js', '*-logic.js', '**\/*.md')
 * @property {Function} identity - (filepath: string) => string — derives the entry identifier
 * @property {Function} [metadata] - (filepath: string, content: string) => Object — extracts metadata per file
 * @property {Function} [validate] - (entry: DiscoveryEntry) => boolean — false excludes the entry
 * @property {boolean} [recursive=false] - Whether to recurse into subdirectories
 */

/**
 * Convert a simple glob pattern into a RegExp for matching filenames.
 *
 * Supports:
 *   - `*` matches any sequence of characters except path separators
 *   - Literal characters are escaped for safe regex usage
 *   - The pattern is anchored to match the full filename
 *
 * @param {string} pattern - The glob pattern (filename portion only, no directory prefix)
 * @returns {RegExp} Compiled regular expression
 */
function patternToRegex(pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('^' + escaped.replace(/\*/g, '[^/]*') + '$');
}

/**
 * Parse a discovery pattern into its file-matching regex and whether
 * recursive scanning is implied by a `**\/` prefix.
 *
 * @param {string} pattern - The discovery pattern (e.g., '*.md', '**\/*.md')
 * @returns {{ regex: RegExp, impliedRecursive: boolean }}
 */
function parsePattern(pattern) {
  const impliedRecursive = pattern.startsWith('**/');
  return {
    regex: patternToRegex(impliedRecursive ? pattern.slice(3) : pattern),
    impliedRecursive,
  };
}

/**
 * Collect file paths from a directory, optionally recursing into subdirectories.
 *
 * @param {string} dir - Absolute path to scan
 * @param {boolean} recursive - Whether to descend into child directories
 * @returns {string[]} Absolute paths of all regular files found
 */
function collectFiles(dir, recursive) {
  const results = [];

  if (!fs.existsSync(dir)) {
    return results;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory() && recursive) {
      results.push(...collectFiles(fullPath, true));
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * Scan a directory for files matching a pattern and produce an array of
 * structured discovery entries.
 *
 * @param {DiscoverOptions} options
 * @returns {Array<DiscoveryEntry>} Entries sorted by id
 */
function discover({ dir, pattern, identity, metadata, validate, recursive = false }) {
  const { regex, impliedRecursive } = parsePattern(pattern);
  const shouldRecurse = recursive || impliedRecursive;

  const filePaths = collectFiles(dir, shouldRecurse);

  const entries = [];

  for (const filePath of filePaths) {
    const filename = path.basename(filePath);

    if (!regex.test(filename)) {
      continue;
    }

    const id = identity(filePath);

    let extra = {};
    if (metadata) {
      const content = readFileSafe(filePath);
      extra = metadata(filePath, content) || {};
    }

    const entry = { id, path: filePath, ...extra };

    if (validate && !validate(entry)) {
      continue;
    }

    entries.push(entry);
  }

  entries.sort((a, b) => a.id.localeCompare(b.id));

  return entries;
}

/**
 * Serialize registry data to stable, newline-terminated JSON.
 *
 * @param {*} data - Any JSON-serializable registry value
 * @returns {string} JSON content ready to write
 */
function serializeRegistry(data) {
  return JSON.stringify(data, null, 2) + '\n';
}

module.exports = {
  discover,
  serializeRegistry,
  patternToRegex,
  parsePattern,
  collectFiles,
};
