import fs from 'node:fs';
import path from 'node:path';
let counter = 0;

/**
 * Creates parent directories and writes content atomically via temp-file + rename.
 * The parent directory is created with mode 0o700 and the file with mode 0o600.
 *
 * @param {string} filePath - Absolute path to the target file
 * @param {string} content - Content to write
 */
function atomicWriteSync(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const tmpFile = `${filePath}.tmp.${process.pid}.${++counter}`;
  try {
    fs.writeFileSync(tmpFile, content, { mode: 0o600 });
    fs.renameSync(tmpFile, filePath);
  } catch (err) {
    try { fs.unlinkSync(tmpFile); } catch {}
    throw err;
  }
}

/**
 * Reads a file and returns its contents as a UTF-8 string.
 * Returns the fallback value on any error (missing file, permission denied, etc.).
 *
 * @param {string} filePath - Absolute or relative path to the file
 * @param {string} [fallback=''] - Value returned when reading fails
 * @returns {string} File contents or fallback
 */
function readFileSafe(filePath: string): string;
function readFileSafe<T extends string | null>(filePath: string, fallback: T): string | T;
function readFileSafe(filePath: string, fallback: string | null = ''): string | null {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return fallback;
  }
}

/**
 * Reads a file and parses its contents as JSON.
 * Returns the fallback value on any error (missing file, invalid JSON, etc.).
 *
 * @param {string} filePath - Absolute or relative path to the file
 * @param {*} [fallback=null] - Value returned when reading or parsing fails
 * @returns {*} Parsed JSON value or fallback
 */
function readJsonSafe<T = unknown>(filePath: string, fallback: T | null = null): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

/**
 * Writes content to a file only when it differs from existing content.
 * Creates parent directories if they do not exist.
 *
 * @param {string} filePath - Absolute path to the target file
 * @param {string} content - Content to write
 * @returns {boolean} True if the file was written, false if content was identical
 */
function writeIfChanged(filePath: string, content: string): boolean {
  const existing = fs.existsSync(filePath)
    ? fs.readFileSync(filePath, 'utf8')
    : null;

  if (existing === content) {
    return false;
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  return true;
}

/**
 * Ensures a directory exists, creating it and all parent directories as needed.
 *
 * @param {string} dirPath - Absolute path to the directory
 */
function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

/**
 * Reads a JSON Lines (JSONL) file, parsing each non-blank line as JSON and
 * skipping lines that fail to parse. Returns [] when the file is absent or
 * unreadable.
 *
 * @param {string} filePath - Absolute or relative path to the JSONL file
 * @returns {Array<*>} Parsed records, one per valid line
 */
function readJsonLines(filePath: string): unknown[] {
  const content = readFileSafe(filePath, '');
  const records = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    try {
      records.push(JSON.parse(trimmed));
    } catch {
      continue;
    }
  }
  return records;
}

/**
 * Appends one record as a JSON line to a JSONL file, creating the file if it
 * does not already exist.
 *
 * @param {string} filePath - Absolute or relative path to the JSONL file
 * @param {*} record - Value to serialize and append as one line
 * @returns {*} The appended record
 */
function appendJsonLine<T>(filePath: string, record: T): T {
  const existing = readFileSafe(filePath, '');
  atomicWriteSync(filePath, `${existing}${JSON.stringify(record)}\n`);
  return record;
}

export {
  atomicWriteSync,
  readFileSafe,
  readJsonSafe,
  writeIfChanged,
  ensureDir,
  readJsonLines,
  appendJsonLine,
};
