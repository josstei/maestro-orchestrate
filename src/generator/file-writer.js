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
 * @param {{ requireFile?: boolean }} [options] - Reject existing non-file destinations
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
 * Writes generated outputs under rootDir and prunes stale files from owned
 * directories. Read-only modes only preview: dry-run logs every status, check
 * logs changes and diff prints unified diffs.
 */
class FileWriter {
  constructor({ rootDir, dryRun = false, diffMode = false, check = false }) {
    Object.assign(this, { rootDir, dryRun, diffMode, check, readOnly: dryRun || diffMode || check });
    this.stats = { changed: 0, unchanged: 0, errors: 0 };
  }

  /** `mode` is a generated executable's permissions; `reason` follows a dry-run CREATE line. */
  write(outputPath, content, mode, reason) {
    try {
      const absOutputPath = safeResolve(outputPath, this.rootDir, { requireFile: true });
      const exists = fs.existsSync(absOutputPath);
      const current = exists ? fs.readFileSync(absOutputPath, 'utf8') : null;
      const modeChanged = exists && modeDiffers(absOutputPath, mode);
      const status = !exists ? 'CREATE' : current === content && !modeChanged ? 'UNCHANGED' : 'UPDATE';

      if (this.diffMode) {
        if (!exists) console.log(`+++ NEW: ${outputPath}`);
        if (modeChanged) console.log(`MODE: ${outputPath} -> ${mode.toString(8)}`);
        if (exists && current !== content) printDiff(absOutputPath, content, outputPath);
      } else if (this.readOnly) {
        const suffix = this.dryRun && status === 'CREATE' && reason ? ` — ${reason}` : '';
        if (this.dryRun || status !== 'UNCHANGED') console.log(`[${status}] ${outputPath}${suffix}`);
      } else if (status !== 'UNCHANGED') {
        if (current !== content) {
          fs.mkdirSync(path.dirname(absOutputPath), { recursive: true });
          fs.writeFileSync(absOutputPath, content, 'utf8');
        }
        // A newly created file has umask permissions, so recheck its mode.
        if (modeDiffers(absOutputPath, mode)) fs.chmodSync(absOutputPath, mode);
      }

      if (status === 'UNCHANGED') {
        this.stats.unchanged++;
      } else {
        this.stats.changed++;
      }
    } catch (err) {
      console.error(`ERROR writing ${outputPath}: ${err.message}`);
      this.stats.errors++;
    }
  }

  writeAll(outputs) {
    for (const output of outputs) {
      this.write(output.outputPath, output.content, output.mode, output.reason);
    }
  }

  clean(outputPaths) {
    if (this.readOnly) {
      return;
    }

    for (const outputPath of outputPaths) {
      const absPath = safeResolve(outputPath, this.rootDir, { requireFile: true });
      if (fs.existsSync(absPath)) {
        fs.unlinkSync(absPath);
      }
    }
  }

  // Logs a non-write failure as an error. An arrow field, as generate.js passes it as a callback.
  reportError = (message, error) => {
    const formatted =
      error && error.message ? `${message}: ${error.message}` : message;
    console.error(`ERROR: ${formatted}`);
    this.stats.errors++;
  };

  /**
   * Rejects outputs and owned directories that escape the root, so call it before writing.
   * Returns the owned files that are not outputs, and every owned subdirectory.
   */
  findStale(outputs, ownedDirs) {
    for (const { outputPath } of outputs) safeResolve(outputPath, this.rootDir, { requireFile: true });
    const outputPaths = new Set(outputs.map(({ outputPath }) => outputPath));
    const stale = { files: [], dirs: [] };
    // A subdirectory follows its contents, so prune empties children before their parents.
    const walk = (dir) => {
      for (const entry of fs.readdirSync(path.join(this.rootDir, dir), { withFileTypes: true })) {
        const relPath = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
          walk(relPath);
          stale.dirs.push(path.join(this.rootDir, relPath));
        } else if (!outputPaths.has(relPath)) {
          stale.files.push(relPath);
        }
      }
    };
    ownedDirs.filter((dir) => fs.existsSync(safeResolve(dir, this.rootDir))).forEach(walk);
    return { files: stale.files.sort(), dirs: stale.dirs };
  }

  /** Delete stale files and the owned subdirectories left empty, then report each file. */
  prune({ files, dirs }) {
    if (!this.readOnly) {
      for (const file of files) fs.unlinkSync(path.join(this.rootDir, file));
      for (const dir of dirs) {
        if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
      }
    }
    const label = this.dryRun || this.check ? '[REMOVE]' : this.diffMode ? '--- REMOVED:' : '  PRUNED:';
    for (const file of files) console.log(`${label} ${file}`);
  }
}

module.exports = { FileWriter, safeResolve };
