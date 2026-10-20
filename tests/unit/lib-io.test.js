'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  atomicWriteSync,
  ensurePrivateDir,
  formatJson,
  readFileSafe,
  readJsonSafe,
  writeIfChanged,
} = require('../../src/lib/io');
const { makeTempDir } = require('../support/fs');
const { SRC_ROOT } = require('../support/paths');

let tempRoot;

beforeEach(() => {
  tempRoot = makeTempDir('maestro-io-');
});

describe('atomicWriteSync', () => {
  it('writes content to the target file', () => {
    const filePath = path.join(tempRoot, 'atomic.txt');
    atomicWriteSync(filePath, 'hello atomic');
    assert.equal(fs.readFileSync(filePath, 'utf8'), 'hello atomic');
  });

  it('creates parent directories that do not exist', () => {
    const filePath = path.join(tempRoot, 'deep', 'nested', 'dir', 'file.txt');
    atomicWriteSync(filePath, 'nested content');
    assert.equal(fs.readFileSync(filePath, 'utf8'), 'nested content');
  });

  it('overwrites existing file content', () => {
    const filePath = path.join(tempRoot, 'overwrite.txt');
    fs.writeFileSync(filePath, 'old', 'utf8');
    atomicWriteSync(filePath, 'new');
    assert.equal(fs.readFileSync(filePath, 'utf8'), 'new');
  });

  it('does not leave temp files behind on success', () => {
    const filePath = path.join(tempRoot, 'clean.txt');
    atomicWriteSync(filePath, 'content');
    const files = fs.readdirSync(tempRoot);
    const tmpFiles = files.filter((f) => f.includes('.tmp.'));
    assert.equal(tmpFiles.length, 0);
  });

  it('uses temp-file-then-rename strategy', (t) => {
    t.mock.method(fs, 'renameSync');

    const filePath = path.join(tempRoot, 'strategy.txt');
    atomicWriteSync(filePath, 'verify strategy');
    assert.ok(fs.renameSync.mock.callCount() > 0, 'renameSync must be called');
    const [src, dest] = fs.renameSync.mock.calls.at(-1).arguments;
    assert.equal(dest, filePath);
    assert.ok(src.includes('.tmp.'), 'source must be a temp file');
    assert.ok(src.includes(`${process.pid}`), 'temp file must include pid');
  });

  it('cleans up temp file when writeFileSync throws', (t) => {
    t.mock.method(fs, 'writeFileSync', () => {
      throw new Error('disk full');
    });

    const filePath = path.join(tempRoot, 'fail.txt');
    assert.throws(() => atomicWriteSync(filePath, 'content'), /disk full/);
    const files = fs.readdirSync(path.dirname(filePath));
    const tmpFiles = files.filter((f) => f.includes('.tmp.'));
    assert.equal(tmpFiles.length, 0);
  });

  it('handles empty content', () => {
    const filePath = path.join(tempRoot, 'empty.txt');
    atomicWriteSync(filePath, '');
    assert.equal(fs.readFileSync(filePath, 'utf8'), '');
  });

  it('generates unique temp file names across sequential calls', (t) => {
    t.mock.method(fs, 'renameSync');

    const fileA = path.join(tempRoot, 'a.txt');
    const fileB = path.join(tempRoot, 'b.txt');
    atomicWriteSync(fileA, 'a');
    atomicWriteSync(fileB, 'b');
    const tempNames = fs.renameSync.mock.calls.map((c) => c.arguments[0]);
    assert.equal(tempNames.length, 2);
    assert.notEqual(tempNames[0], tempNames[1]);
  });
});

describe('readFileSafe', () => {
  it('reads existing file content as UTF-8', () => {
    const filePath = path.join(tempRoot, 'readable.txt');
    fs.writeFileSync(filePath, 'file content', 'utf8');
    assert.equal(readFileSafe(filePath), 'file content');
  });

  it('returns empty string by default when file does not exist', () => {
    const filePath = path.join(tempRoot, 'nonexistent.txt');
    assert.equal(readFileSafe(filePath), '');
  });

  it('returns custom fallback when file does not exist', () => {
    const filePath = path.join(tempRoot, 'missing.txt');
    assert.equal(readFileSafe(filePath, 'default value'), 'default value');
  });

  it('returns null fallback when explicitly passed', () => {
    const filePath = path.join(tempRoot, 'missing.txt');
    assert.equal(readFileSafe(filePath, null), null);
  });

  it('returns fallback when path is a directory', () => {
    assert.equal(readFileSafe(tempRoot, 'fallback'), 'fallback');
  });

  it('does not throw on any error condition', () => {
    assert.doesNotThrow(() => readFileSafe('/nonexistent/path/file.txt'));
  });

  it('preserves multi-line content', () => {
    const filePath = path.join(tempRoot, 'multiline.txt');
    const content = 'line1\nline2\nline3\n';
    fs.writeFileSync(filePath, content, 'utf8');
    assert.equal(readFileSafe(filePath), content);
  });

  it('preserves unicode content', () => {
    const filePath = path.join(tempRoot, 'unicode.txt');
    const content = 'héllo wörld — 日本語 🎼\n';
    fs.writeFileSync(filePath, content, 'utf8');
    assert.equal(readFileSafe(filePath), content);
  });
});

describe('readJsonSafe', () => {
  it('parses valid JSON from file', () => {
    const filePath = path.join(tempRoot, 'data.json');
    const data = { name: 'maestro', version: 1, nested: { key: 'value' } };
    fs.writeFileSync(filePath, JSON.stringify(data), 'utf8');
    assert.deepEqual(readJsonSafe(filePath), data);
  });

  it('returns null by default when file does not exist', () => {
    const filePath = path.join(tempRoot, 'nonexistent.json');
    assert.equal(readJsonSafe(filePath), null);
  });

  it('returns custom fallback when file does not exist', () => {
    const filePath = path.join(tempRoot, 'missing.json');
    const fallback = { default: true };
    assert.deepEqual(readJsonSafe(filePath, fallback), fallback);
  });

  it('returns fallback when file contains invalid JSON', () => {
    const filePath = path.join(tempRoot, 'bad.json');
    fs.writeFileSync(filePath, '{not valid json}', 'utf8');
    assert.deepEqual(readJsonSafe(filePath, { error: true }), { error: true });
  });

  it('returns null fallback for invalid JSON when no fallback specified', () => {
    const filePath = path.join(tempRoot, 'bad.json');
    fs.writeFileSync(filePath, 'not json at all', 'utf8');
    assert.equal(readJsonSafe(filePath), null);
  });

  it('parses JSON arrays', () => {
    const filePath = path.join(tempRoot, 'array.json');
    const data = [1, 'two', { three: 3 }];
    fs.writeFileSync(filePath, JSON.stringify(data), 'utf8');
    assert.deepEqual(readJsonSafe(filePath), data);
  });

  it('parses JSON primitives', () => {
    const filePath = path.join(tempRoot, 'primitive.json');
    fs.writeFileSync(filePath, '42', 'utf8');
    assert.equal(readJsonSafe(filePath), 42);
  });

  it('returns fallback when file is empty', () => {
    const filePath = path.join(tempRoot, 'empty.json');
    fs.writeFileSync(filePath, '', 'utf8');
    assert.equal(readJsonSafe(filePath, 'empty'), 'empty');
  });

  it('does not throw on any error condition', () => {
    assert.doesNotThrow(() => readJsonSafe('/nonexistent/path/file.json'));
  });
});

describe('writeIfChanged', () => {
  it('writes a new file and returns true', () => {
    const filePath = path.join(tempRoot, 'new.txt');
    const result = writeIfChanged(filePath, 'new content');
    assert.equal(result, true);
    assert.equal(fs.readFileSync(filePath, 'utf8'), 'new content');
  });

  it('returns false when content is identical to existing file', () => {
    const filePath = path.join(tempRoot, 'unchanged.txt');
    fs.writeFileSync(filePath, 'same content', 'utf8');
    const result = writeIfChanged(filePath, 'same content');
    assert.equal(result, false);
  });

  it('does not modify the file when content is identical', () => {
    const filePath = path.join(tempRoot, 'unchanged.txt');
    fs.writeFileSync(filePath, 'same content', 'utf8');
    const mtimeBefore = fs.statSync(filePath).mtimeMs;
    writeIfChanged(filePath, 'same content');
    const mtimeAfter = fs.statSync(filePath).mtimeMs;
    assert.equal(mtimeBefore, mtimeAfter);
  });

  it('writes and returns true when content differs', () => {
    const filePath = path.join(tempRoot, 'changed.txt');
    fs.writeFileSync(filePath, 'old content', 'utf8');
    const result = writeIfChanged(filePath, 'new content');
    assert.equal(result, true);
    assert.equal(fs.readFileSync(filePath, 'utf8'), 'new content');
  });

  it('creates parent directories for new files', () => {
    const filePath = path.join(tempRoot, 'deep', 'nested', 'file.txt');
    const result = writeIfChanged(filePath, 'deep content');
    assert.equal(result, true);
    assert.equal(fs.readFileSync(filePath, 'utf8'), 'deep content');
  });

  it('handles empty string content for new file', () => {
    const filePath = path.join(tempRoot, 'empty.txt');
    const result = writeIfChanged(filePath, '');
    assert.equal(result, true);
    assert.equal(fs.readFileSync(filePath, 'utf8'), '');
  });

  it('returns false when existing file and new content are both empty', () => {
    const filePath = path.join(tempRoot, 'both-empty.txt');
    fs.writeFileSync(filePath, '', 'utf8');
    const result = writeIfChanged(filePath, '');
    assert.equal(result, false);
  });
});

describe('formatJson', () => {
  it('serializes a JSON array with trailing newline', () => {
    const content = formatJson([{ id: 'a' }, { id: 'b' }]);
    assert.ok(content.endsWith('\n'));
    assert.deepEqual(JSON.parse(content), [{ id: 'a' }, { id: 'b' }]);
  });

  it('serializes a JSON object with trailing newline', () => {
    const content = formatJson({ 'session-start': { module: 'm', fn: 'f' } });
    assert.ok(content.endsWith('\n'));
    assert.deepEqual(JSON.parse(content), { 'session-start': { module: 'm', fn: 'f' } });
  });

  it('uses 2-space indentation', () => {
    const content = formatJson({ key: 'value' });
    assert.ok(content.includes('  "key"'));
  });
});

describe('ensurePrivateDir', () => {
  it('creates the directory and missing parents', () => {
    const dir = path.join(tempRoot, 'a', 'b', 'private');
    ensurePrivateDir(dir, 'unused');
    assert.ok(fs.statSync(dir).isDirectory());
  });

  it('throws the given message when the directory is a symlink', () => {
    const target = path.join(tempRoot, 'target');
    fs.mkdirSync(target);
    const link = path.join(tempRoot, 'link');
    fs.symlinkSync(target, link, 'dir');
    assert.throws(
      () => ensurePrivateDir(link, 'must not be a symlink'),
      { message: 'must not be a symlink' }
    );
  });
});

describe('readStdin', () => {
  // stdin is per process, so each case reads it in a child.
  function readStdinFrom(input) {
    const script = `require(${JSON.stringify(path.join(SRC_ROOT, 'lib', 'io.js'))}).readStdin().then(
      (text) => process.stdout.write(JSON.stringify({ text })),
      (err) => process.stdout.write(JSON.stringify({ error: err.message })));`;
    const result = spawnSync(process.execPath, ['-e', script], {
      input: Buffer.from(input, 'utf8'),
      maxBuffer: 4 * 1024 * 1024,
    });
    assert.equal(result.status, 0, result.stderr.toString());
    assert.equal(result.stderr.toString(), '');
    return JSON.parse(result.stdout.toString());
  }

  it('returns the full piped payload', () => {
    assert.deepEqual(readStdinFrom('hello world'), { text: 'hello world' });
  });

  it('returns an empty string for empty stdin', () => {
    assert.deepEqual(readStdinFrom(''), { text: '' });
  });

  it('rejects when the payload exceeds the 1 MiB cap', () => {
    assert.deepEqual(readStdinFrom('a'.repeat(1024 * 1024 + 10)), { error: 'Stdin payload too large' });
  });

  it('counts the cap in raw UTF-8 bytes and decodes multi-byte input intact', () => {
    // 'é' is 2 bytes: 512 KiB of them is exactly the cap, one more exceeds it.
    assert.deepEqual(readStdinFrom('é'.repeat(512 * 1024)), { text: 'é'.repeat(512 * 1024) });
    assert.deepEqual(readStdinFrom('é'.repeat(512 * 1024 + 1)), { error: 'Stdin payload too large' });
  });
});
