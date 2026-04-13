'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

/**
 * @param {string} relativePath
 * @param {string} rootDir
 * @returns {string}
 * @throws {Error} If the resolved path escapes the root directory
 */
function safeResolve(relativePath, rootDir) {
  const resolved = path.resolve(rootDir, relativePath);
  if (!resolved.startsWith(rootDir + path.sep) && resolved !== rootDir) {
    throw new Error(`Path traversal detected: "${relativePath}" resolves outside project root`);
  }
  return resolved;
}

/**
 * @param {string} absOutputPath
 * @param {string} content
 * @param {string} displayPath
 */
function executeDiff(absOutputPath, content, displayPath) {
  if (!fs.existsSync(absOutputPath)) {
    console.log(`+++ NEW: ${displayPath}`);
    return;
  }

  const current = fs.readFileSync(absOutputPath, 'utf8');
  if (current === content) {
    return;
  }

  const tmpPath = absOutputPath + '.gen-tmp';
  fs.writeFileSync(tmpPath, content, 'utf8');
  try {
    execFileSync('diff', ['-u', absOutputPath, tmpPath], { encoding: 'utf8' });
  } catch (err) {
    console.log(`--- ${displayPath}`);
    console.log(err.stdout);
  } finally {
    fs.unlinkSync(tmpPath);
  }
}

/**
 * @param {string} absOutputPath
 * @param {string} content
 * @param {string} displayPath
 */
function executeDryRun(absOutputPath, content, displayPath) {
  const exists = fs.existsSync(absOutputPath);
  const current = exists ? fs.readFileSync(absOutputPath, 'utf8') : null;

  let status;
  if (!exists) {
    status = 'CREATE';
  } else if (current === content) {
    status = 'UNCHANGED';
  } else {
    status = 'UPDATE';
  }

  console.log(`[${status}] ${displayPath}`);
}

/**
 * @param {string} absOutputPath
 * @param {string} content
 * @param {{ written: number, unchanged: number, errors: number }} stats
 */
function executeWrite(absOutputPath, content, stats) {
  fs.mkdirSync(path.dirname(absOutputPath), { recursive: true });

  const exists = fs.existsSync(absOutputPath);
  const current = exists ? fs.readFileSync(absOutputPath, 'utf8') : null;

  if (current === content) {
    stats.unchanged++;
  } else {
    fs.writeFileSync(absOutputPath, content, 'utf8');
    stats.written++;
  }
}

/**
 * @typedef {Object} FileWriterOptions
 * @property {string} rootDir - Absolute path to the project root directory
 * @property {boolean} [dryRun=false] - Log intended actions without writing files
 * @property {boolean} [diffMode=false] - Show unified diffs against existing files
 */

/**
 * @typedef {Object} FileWriterStats
 * @property {number} written - Number of files written (new or changed)
 * @property {number} unchanged - Number of files skipped (content identical)
 * @property {number} errors - Number of files that failed to write
 */

/**
 * @typedef {Object} FileWriter
 * @property {(outputPath: string, content: string) => void} write
 * @property {(outputPaths: string[]) => void} clean
 * @property {() => FileWriterStats} getStats
 */

/**
 * Creates a file writer that handles write, diff, dry-run, and clean operations.
 *
 * @param {FileWriterOptions} opts
 * @returns {FileWriter}
 */
function createFileWriter(opts) {
  const { rootDir, dryRun = false, diffMode = false } = opts;
  const stats = { written: 0, unchanged: 0, errors: 0 };

  /**
   * @param {string} outputPath - Relative path from rootDir
   * @param {string} content - File content to write
   */
  function write(outputPath, content) {
    try {
      const absOutputPath = safeResolve(outputPath, rootDir);
      if (diffMode) {
        executeDiff(absOutputPath, content, outputPath);
      } else if (dryRun) {
        executeDryRun(absOutputPath, content, outputPath);
      } else {
        executeWrite(absOutputPath, content, stats);
      }
    } catch (err) {
      console.error(`ERROR writing ${outputPath}: ${err.message}`);
      stats.errors++;
    }
  }

  /**
   * @param {string[]} outputPaths - Relative paths from rootDir to delete
   */
  function clean(outputPaths) {
    for (const outputPath of outputPaths) {
      const absPath = safeResolve(outputPath, rootDir);
      if (fs.existsSync(absPath)) {
        fs.unlinkSync(absPath);
      }
    }
  }

  /**
   * @returns {FileWriterStats}
   */
  function getStats() {
    return { written: stats.written, unchanged: stats.unchanged, errors: stats.errors };
  }

  return { write, clean, getStats };
}

module.exports = { createFileWriter, safeResolve };
