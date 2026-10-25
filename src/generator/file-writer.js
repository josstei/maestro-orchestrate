'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

function modeDiffers(filePath, mode) {
  // Windows does not expose POSIX executable bits through chmod/stat. Compare
  // only whether any execute bit is set, so umask differences such as 0775
  // for 0755 are not drift.
  return mode !== undefined && process.platform !== 'win32' &&
    ((fs.statSync(filePath).mode & 0o111) !== 0) !== ((mode & 0o111) !== 0);
}

/**
 * @param {string} relativePath
 * @param {string} rootDir
 * @param {{ requireFile?: boolean }} [options] - Reject existing non-file destinations
 * @returns {string}
 * @throws {Error} If the resolved path escapes the root directory
 */
function safeResolve(relativePath, rootDir, { requireFile = false } = {}) {
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
      const stat = fs.lstatSync(current);
      if (stat.isSymbolicLink()) {
        throw new Error(`Symlink path is not allowed for generated files: ${current}`);
      }
      if (requireFile && current === resolved && !stat.isFile()) {
        throw new Error(`Expected a regular file: ${current}`);
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
function printDiff(absOutputPath, content, displayPath) {
  try {
    execFileSync('diff', ['-u', absOutputPath, '-'], { encoding: 'utf8', input: content });
  } catch (err) {
    if (err.status !== 1) throw err;
    console.log(`--- ${displayPath}`);
    console.log(err.stdout);
  }
}

/**
 * @typedef {Object} FileWriterOptions
 * @property {string} rootDir - Absolute path to the project root directory
 * @property {boolean} [dryRun=false] - Log intended actions without writing files
 * @property {boolean} [diffMode=false] - Show unified diffs against existing files
 * @property {boolean} [check=false] - Log only outputs that would change, without writing files
 */

/**
 * @typedef {Object} FileWriterStats
 * @property {number} written - Number of files written (new or changed); 0 in read-only modes
 * @property {number} changed - Number of outputs that are new or differ in content or executable bit
 * @property {number} unchanged - Number of outputs whose content and executable bit already match
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
 * Creates a file writer that handles write, diff, dry-run, check, and clean operations.
 *
 * @param {FileWriterOptions} opts
 * @returns {FileWriter}
 */
function createFileWriter(opts) {
  const { rootDir, dryRun = false, diffMode = false, check = false } = opts;
  const stats = { changed: 0, unchanged: 0, errors: 0 };
  const readOnlyMode = dryRun || diffMode || check;

  /**
   * @param {string} outputPath - Relative path from rootDir
   * @param {string} content - File content to write
   * @param {number} [mode] - POSIX permissions for a generated executable
   */
  function write(outputPath, content, mode) {
    try {
      const absOutputPath = safeResolve(outputPath, rootDir, { requireFile: true });
      const exists = fs.existsSync(absOutputPath);
      const current = exists ? fs.readFileSync(absOutputPath, 'utf8') : null;
      const modeChanged = exists && modeDiffers(absOutputPath, mode);
      const status = !exists ? 'CREATE' : current === content && !modeChanged ? 'UNCHANGED' : 'UPDATE';

      if (diffMode) {
        if (!exists) console.log(`+++ NEW: ${outputPath}`);
        if (modeChanged) console.log(`MODE: ${outputPath} -> ${mode.toString(8)}`);
        if (exists && current !== content) printDiff(absOutputPath, content, outputPath);
      } else if (readOnlyMode) {
        if (dryRun || status !== 'UNCHANGED') console.log(`[${status}] ${outputPath}`);
      } else if (status !== 'UNCHANGED') {
        if (current !== content) {
          fs.mkdirSync(path.dirname(absOutputPath), { recursive: true });
          fs.writeFileSync(absOutputPath, content, 'utf8');
        }
        // A newly created file has umask permissions, so recheck its mode.
        if (modeDiffers(absOutputPath, mode)) fs.chmodSync(absOutputPath, mode);
      }

      if (status === 'UNCHANGED') {
        stats.unchanged++;
      } else {
        stats.changed++;
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
      const absPath = safeResolve(outputPath, rootDir, { requireFile: true });
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
    return {
      written: readOnlyMode ? 0 : stats.changed,
      changed: stats.changed,
      unchanged: stats.unchanged,
      errors: stats.errors,
    };
  }

  return { write, writeAll, clean, reportError, getStats };
}

module.exports = { createFileWriter, safeResolve };
