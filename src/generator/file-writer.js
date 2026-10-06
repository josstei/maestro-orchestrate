'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { writeIfChanged } = require('../lib/io');

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
  let status = 'CREATE';
  if (fs.existsSync(absOutputPath)) {
    status = fs.readFileSync(absOutputPath, 'utf8') === content ? 'UNCHANGED' : 'UPDATE';
  }
  console.log(`[${status}] ${displayPath}`);
}

/**
 * @param {string} absOutputPath
 * @param {string} content
 * @param {{ written: number, unchanged: number, errors: number }} stats
 */
function executeWrite(absOutputPath, content, stats) {
  if (writeIfChanged(absOutputPath, content)) {
    stats.written++;
  } else {
    stats.unchanged++;
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
 * @property {number} errors - Number of failed writes plus reported errors
 */

/**
 * @typedef {Object} FileWriter
 * @property {(outputPath: string, content: string) => void} write
 * @property {(outputs: Array<{ outputPath: string, content: string }>) => void} writeAll
 * @property {(outputPaths: string[]) => void} clean
 * @property {(message: string, error?: Error) => void} reportError
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
  const readOnlyMode = dryRun || diffMode;

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
   * @param {Array<{ outputPath: string, content: string }>} outputs
   */
  function writeAll(outputs) {
    for (const output of outputs) {
      write(output.outputPath, output.content);
    }
  }

  /**
   * @param {string[]} outputPaths - Relative paths from rootDir to delete
   */
  function clean(outputPaths) {
    if (readOnlyMode) {
      return;
    }

    for (const outputPath of outputPaths) {
      const absPath = safeResolve(outputPath, rootDir);
      if (fs.existsSync(absPath)) {
        fs.unlinkSync(absPath);
      }
    }
  }

  /**
   * Log a non-write failure and count it toward the error total.
   * @param {string} message
   * @param {Error} [error]
   */
  function reportError(message, error) {
    const formatted =
      error && error.message ? `${message}: ${error.message}` : message;
    console.error(`ERROR: ${formatted}`);
    stats.errors++;
  }

  /**
   * @returns {FileWriterStats}
   */
  function getStats() {
    return { written: stats.written, unchanged: stats.unchanged, errors: stats.errors };
  }

  return { write, writeAll, clean, reportError, getStats };
}

module.exports = { createFileWriter, safeResolve };
