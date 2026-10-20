'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { escapeRegExp } = require('../lib/naming');

/**
 * List the regular files under dir as posix paths relative to it, descending
 * into subdirectories only when recursive. A missing dir has no files.
 * @param {string} dir - Absolute directory to list
 * @param {boolean} recursive
 * @param {string} [prefix] - Posix path of dir relative to the listing root
 * @returns {string[]}
 */
function listFiles(dir, recursive, prefix = '') {
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = prefix + entry.name;
    if (entry.isDirectory()) {
      return recursive ? listFiles(path.join(dir, entry.name), true, `${relativePath}/`) : [];
    }
    return entry.isFile() ? [relativePath] : [];
  });
}

/**
 * Match the files under rootDir against a glob. `*` is a wildcard within the
 * final (file name) segment only; a `**` segment directly before it also
 * matches files in any subdirectory. Every other segment is a literal
 * directory name, and every other character matches literally.
 * @param {string} rootDir - Absolute directory the pattern is relative to
 * @param {string} pattern - e.g. 'agents/*.md', 'skills/shared/**\/SKILL.md' or '**\/*'
 * @returns {string[]} Sorted posix paths relative to rootDir
 * @throws {Error} When the final segment is `**` or a directory segment
 *   contains `*`
 */
function globFiles(rootDir, pattern) {
  const segments = pattern.split('/');
  const fileName = segments.pop();
  const recursive = segments[segments.length - 1] === '**';
  if (recursive) segments.pop();
  if (fileName === '**' || segments.some((segment) => segment.includes('*'))) {
    throw new Error(`Unsupported manifest glob: ${pattern}`);
  }

  const fileRegex = new RegExp(`^${fileName.split('*').map(escapeRegExp).join('[^/]*')}$`);
  const prefix = segments.map((segment) => `${segment}/`).join('');
  return listFiles(path.join(rootDir, ...segments), recursive, prefix)
    .filter((relativePath) => fileRegex.test(path.posix.basename(relativePath)))
    .sort();
}

module.exports = { globFiles };
