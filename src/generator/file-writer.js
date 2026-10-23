'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { writeIfChanged } = require('../lib/io');

function modeDiffers(filePath, mode) {
  // Windows does not expose POSIX executable bits through chmod/stat.
  return mode !== undefined && process.platform !== 'win32' &&
    (fs.statSync(filePath).mode & 0o777) !== mode;
}

/**
 * @param {string} relativePath
 * @param {string} rootDir
 * @returns {string}
 * @throws {Error} If the resolved path escapes the root directory
 */
function safeResolve(relativePath, rootDir) {
  rootDir = path.resolve(rootDir);
  const resolved = path.resolve(rootDir, relativePath);
  if (!resolved.startsWith(rootDir + path.sep) && resolved !== rootDir) {
    throw new Error(`Path traversal detected: "${relativePath}" resolves outside project root`);
  }
  // Existing symlink files or directories would make an otherwise lexical
  // in-root write/clean escape its ownership boundary. Check before mutation,
  // including broken links; missing descendants are safe to create later.
  let current = rootDir;
  for (const segment of ['', ...path.relative(rootDir, resolved).split(path.sep).filter(Boolean)]) {
    if (segment) current = path.join(current, segment);
    try {
      if (fs.lstatSync(current).isSymbolicLink()) {
        throw new Error(`Symlink path is not allowed for generated files: ${current}`);
      }
    } catch (error) {
      if (error.code === 'ENOENT') break;
      throw error;
    }
  }
  return resolved;
}

/**
 * @param {string} absOutputPath
 * @param {string} content
 * @param {string} displayPath
 */
function executeDiff(absOutputPath, content, displayPath, mode) {
  if (!fs.existsSync(absOutputPath)) {
    console.log(`+++ NEW: ${displayPath}`);
    return;
  }

  if (modeDiffers(absOutputPath, mode)) {
    console.log(`MODE: ${displayPath} -> ${mode.toString(8)}`);
  }
  const current = fs.readFileSync(absOutputPath, 'utf8');
  if (current === content) {
    return;
  }

  try {
    execFileSync('diff', ['-u', absOutputPath, '-'], { encoding: 'utf8', input: content });
  } catch (err) {
    console.log(`--- ${displayPath}`);
    console.log(err.stdout);
  }
}

/**
 * @param {string} absOutputPath
 * @param {string} content
 * @param {string} displayPath
 */
function executeDryRun(absOutputPath, content, displayPath, mode) {
  let status = 'CREATE';
  if (fs.existsSync(absOutputPath)) {
    status = fs.readFileSync(absOutputPath, 'utf8') === content && !modeDiffers(absOutputPath, mode)
      ? 'UNCHANGED' : 'UPDATE';
  }
  console.log(`[${status}] ${displayPath}`);
}

/**
 * @param {string} absOutputPath
 * @param {string} content
 * @param {{ written: number, unchanged: number, errors: number }} stats
 */
function executeWrite(absOutputPath, content, stats, mode) {
  const written = writeIfChanged(absOutputPath, content);
  const modeChanged = modeDiffers(absOutputPath, mode);
  if (modeChanged) fs.chmodSync(absOutputPath, mode);
  if (written || modeChanged) {
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
 * @property {(outputPath: string, content: string, mode?: number) => void} write
 * @property {(outputs: Iterable<{ outputPath: string, content: string, mode?: number }>) => void} writeAll
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
   * @param {number} [mode] - POSIX permissions for a generated executable
   */
  function write(outputPath, content, mode) {
    try {
      const absOutputPath = safeResolve(outputPath, rootDir);
      if (diffMode) {
        executeDiff(absOutputPath, content, outputPath, mode);
      } else if (dryRun) {
        executeDryRun(absOutputPath, content, outputPath, mode);
      } else {
        executeWrite(absOutputPath, content, stats, mode);
      }
    } catch (err) {
      console.error(`ERROR writing ${outputPath}: ${err.message}`);
      stats.errors++;
    }
  }

  /**
   * @param {Iterable<{ outputPath: string, content: string, mode?: number }>} outputs
   */
  function writeAll(outputs) {
    for (const output of outputs) {
      write(output.outputPath, output.content, output.mode);
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
