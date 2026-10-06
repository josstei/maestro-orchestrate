'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * Recursively collect all file and subdirectory paths under a directory.
 * Paths are relative to rootDir with forward-slash separators. Subdirectories
 * are recorded after their contents (leaf-first within each subtree).
 * @param {string} dir - Relative directory path (forward-slash separated; '' for rootDir itself)
 * @param {string} rootDir - Absolute path to the project root
 * @param {{ files: string[], dirs: string[] }} out - Accumulator for file and subdirectory paths
 */
function walk(dir, rootDir, out) {
  const absDir = path.join(rootDir, dir);
  if (!fs.existsSync(absDir)) {
    return;
  }
  const entries = fs.readdirSync(absDir, { withFileTypes: true });
  for (const entry of entries) {
    const relPath = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      walk(relPath, rootDir, out);
      out.dirs.push(relPath);
    } else {
      out.files.push(relPath);
    }
  }
}

/**
 * Prune stale generated files and empty directories from owned directories.
 *
 * Walks each owned directory, identifies files not present in the manifest path set,
 * deletes them, then removes any empty directories left behind (deepest first).
 *
 * @param {Object} opts
 * @param {string} opts.rootDir - Absolute path to the project root
 * @param {Set<string>} opts.manifestPaths - Set of all valid manifest output paths (forward-slash relative)
 * @param {string[]} opts.ownedDirs - Relative directory paths the generator owns
 * @returns {{ pruned: string[], emptyDirsRemoved: string[] }}
 */
function pruneStaleFiles({ rootDir, manifestPaths, ownedDirs }) {
  const pruned = [];
  const emptyDirsRemoved = [];

  const owned = { files: [], dirs: [] };
  for (const dir of ownedDirs) {
    walk(dir, rootDir, owned);
  }

  const staleFiles = owned.files.filter((filePath) => !manifestPaths.has(filePath));
  for (const filePath of staleFiles) {
    fs.unlinkSync(path.join(rootDir, filePath));
    pruned.push(filePath);
  }

  const ownedSubdirs = owned.dirs.sort((a, b) => b.length - a.length);

  for (const dir of ownedSubdirs) {
    const absDir = path.join(rootDir, dir);
    if (!fs.existsSync(absDir)) {
      continue;
    }
    if (fs.readdirSync(absDir).length === 0) {
      fs.rmdirSync(absDir);
      emptyDirsRemoved.push(dir);
    }
  }

  return { pruned, emptyDirsRemoved };
}

module.exports = { pruneStaleFiles };
