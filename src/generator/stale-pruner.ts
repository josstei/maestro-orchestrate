import fs from 'node:fs';
import path from 'node:path';

/**
 * Recursively collect all file paths under a directory.
 * Returns relative paths using forward-slash separators.
 * @param {string} dir - Relative directory path (forward-slash separated)
 * @param {string} rootDir - Absolute path to the project root
 * @returns {string[]} Relative file paths within the directory
 */
function walkDir(dir: string, rootDir: string): string[] {
  const results: string[] = [];
  const absDir = path.join(rootDir, dir);
  if (!fs.existsSync(absDir)) {
    return results;
  }
  const entries = fs.readdirSync(absDir, { withFileTypes: true });
  for (const entry of entries) {
    const relPath = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      results.push(...walkDir(relPath, rootDir));
    } else {
      results.push(relPath);
    }
  }
  return results;
}

/**
 * Recursively collect all subdirectory paths under a directory.
 * Returns leaf-first ordering suitable for bottom-up deletion.
 * @param {string} dir - Relative directory path (forward-slash separated)
 * @param {string} rootDir - Absolute path to the project root
 * @returns {string[]} Relative subdirectory paths, deepest first within each subtree
 */
function walkSubdirs(dir: string, rootDir: string): string[] {
  const results: string[] = [];
  const absDir = path.join(rootDir, dir);
  if (!fs.existsSync(absDir)) {
    return results;
  }
  const entries = fs.readdirSync(absDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const relPath = `${dir}/${entry.name}`;
    results.push(...walkSubdirs(relPath, rootDir));
    results.push(relPath);
  }
  return results;
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
function pruneStaleFiles({
  rootDir,
  manifestPaths,
  ownedDirs,
}: {
  rootDir: string;
  manifestPaths: Set<string>;
  ownedDirs: readonly string[];
}): { pruned: string[]; emptyDirsRemoved: string[] } {
  const pruned: string[] = [];
  const emptyDirsRemoved: string[] = [];

  const allOwnedFiles: string[] = [];
  for (const dir of ownedDirs) {
    allOwnedFiles.push(...walkDir(dir, rootDir));
  }

  const staleFiles = allOwnedFiles.filter((filePath) => !manifestPaths.has(filePath));
  for (const filePath of staleFiles) {
    fs.unlinkSync(path.join(rootDir, filePath));
    pruned.push(filePath);
  }

  const ownedSubdirs = ownedDirs
    .flatMap((dir) => walkSubdirs(dir, rootDir))
    .sort((a, b) => b.length - a.length);

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

  const ownedRootDirs = [...ownedDirs].sort((a, b) => b.length - a.length);
  for (const dir of ownedRootDirs) {
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

export { pruneStaleFiles };
