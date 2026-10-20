'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { globFiles } = require('./glob-files');

/**
 * Reorder paths the way a depth-first walk of name-sorted directories meets
 * them, the order the generator has always printed PRUNED lines in. Plain
 * string order puts 'maestro.toml' before 'maestro/x.toml', because '.' sorts
 * below '/'; sorting with '/' as the lowest character does not.
 * @param {string[]} paths - Posix paths
 * @returns {string[]}
 */
function inWalkOrder(paths) {
  return paths.map((p) => p.replaceAll('/', '\0')).sort().map((key) => key.replaceAll('\0', '/'));
}

/**
 * Remove dir and then each parent that removing it leaves empty, stopping
 * below ownedDir (which is never removed) or at the first non-empty or
 * already-removed directory.
 * @param {string} rootDir - Absolute path to the project root
 * @param {string} dir - Posix directory relative to rootDir
 * @param {string} ownedDir - Posix owned directory that contains dir ('' for rootDir)
 */
function removeEmptyDirs(rootDir, dir, ownedDir) {
  for (let current = dir; current !== ownedDir && current !== '.'; current = path.posix.dirname(current)) {
    const absDir = path.join(rootDir, current);
    if (!fs.existsSync(absDir) || fs.readdirSync(absDir).length > 0) {
      return;
    }
    fs.rmdirSync(absDir);
  }
}

/**
 * Delete the files under each owned directory that are not in manifestPaths,
 * then remove the subdirectories that deleting them left empty.
 *
 * @param {Object} opts
 * @param {string} opts.rootDir - Absolute path to the project root
 * @param {Set<string>} opts.manifestPaths - Every current output path (posix, relative to rootDir)
 * @param {string[]} opts.ownedDirs - Posix directories relative to rootDir that the generator owns ('' for rootDir itself)
 * @returns {string[]} The pruned files (posix, relative to rootDir), by owned
 *   directory, each in walk order
 */
function pruneStaleFiles({ rootDir, manifestPaths, ownedDirs }) {
  return ownedDirs.flatMap((ownedDir) => {
    const stale = inWalkOrder(globFiles(rootDir, ownedDir ? `${ownedDir}/**/*` : '**/*')
      .filter((filePath) => !manifestPaths.has(filePath)));
    for (const filePath of stale) {
      fs.unlinkSync(path.join(rootDir, filePath));
    }
    for (const filePath of stale) {
      removeEmptyDirs(rootDir, path.posix.dirname(filePath), ownedDir);
    }
    return stale;
  });
}

module.exports = { pruneStaleFiles };
