'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createFileWriter, safeResolve } = require('../../src/generator/file-writer');

function createTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-fw-'));
}

function removeTempRoot(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

describe('safeResolve', () => {
  let tempRoot;

  beforeEach(() => {
    tempRoot = createTempRoot();
  });

  afterEach(() => {
    removeTempRoot(tempRoot);
  });

  it('resolves a relative path within the root directory', () => {
    const resolved = safeResolve('sub/file.txt', tempRoot);
    assert.equal(resolved, path.join(tempRoot, 'sub', 'file.txt'));
  });

  it('throws on path traversal attempting to escape root', () => {
    assert.throws(
      () => safeResolve('../../../etc/passwd', tempRoot),
      /Path traversal detected/
    );
  });

  it('throws on absolute path that escapes root', () => {
    assert.throws(
      () => safeResolve('/etc/passwd', tempRoot),
      /Path traversal detected/
    );
  });

  it('allows resolving to the root directory itself', () => {
    const resolved = safeResolve('.', tempRoot);
    assert.equal(resolved, tempRoot);
  });
});

describe('FileWriter write', () => {
  let tempRoot;

  beforeEach(() => {
    tempRoot = createTempRoot();
  });

  afterEach(() => {
    removeTempRoot(tempRoot);
  });

  it('creates a new file in the correct directory', () => {
    const writer = createFileWriter({ rootDir: tempRoot });

    writer.write('output/test.txt', 'new content');

    const written = fs.readFileSync(path.join(tempRoot, 'output', 'test.txt'), 'utf8');
    assert.equal(written, 'new content');
  });

  it('creates parent directories recursively', () => {
    const writer = createFileWriter({ rootDir: tempRoot });

    writer.write('deep/nested/dir/file.txt', 'deep content');

    const written = fs.readFileSync(
      path.join(tempRoot, 'deep', 'nested', 'dir', 'file.txt'),
      'utf8'
    );
    assert.equal(written, 'deep content');
  });

  it('detects unchanged content and skips writing', () => {
    const filePath = path.join(tempRoot, 'unchanged.txt');
    fs.writeFileSync(filePath, 'same content', 'utf8');
    const mtimeBefore = fs.statSync(filePath).mtimeMs;

    const writer = createFileWriter({ rootDir: tempRoot });
    writer.write('unchanged.txt', 'same content');

    const mtimeAfter = fs.statSync(filePath).mtimeMs;
    assert.equal(mtimeBefore, mtimeAfter);

    const stats = writer.getStats();
    assert.equal(stats.unchanged, 1);
    assert.equal(stats.written, 0);
  });

  it('updates changed content', () => {
    const filePath = path.join(tempRoot, 'update.txt');
    fs.writeFileSync(filePath, 'old content', 'utf8');

    const writer = createFileWriter({ rootDir: tempRoot });
    writer.write('update.txt', 'new content');

    const written = fs.readFileSync(filePath, 'utf8');
    assert.equal(written, 'new content');

    const stats = writer.getStats();
    assert.equal(stats.written, 1);
    assert.equal(stats.unchanged, 0);
  });

  it('tracks errors when path traversal is detected', () => {
    const writer = createFileWriter({ rootDir: tempRoot });
    writer.write('../../../etc/passwd', 'malicious');

    const stats = writer.getStats();
    assert.equal(stats.errors, 1);
    assert.equal(stats.written, 0);
  });
});

describe('FileWriter getStats', () => {
  let tempRoot;

  beforeEach(() => {
    tempRoot = createTempRoot();
  });

  afterEach(() => {
    removeTempRoot(tempRoot);
  });

  it('tracks written and unchanged counts across multiple writes', () => {
    const existingPath = path.join(tempRoot, 'existing.txt');
    fs.writeFileSync(existingPath, 'unchanged', 'utf8');

    const writer = createFileWriter({ rootDir: tempRoot });
    writer.write('new-file.txt', 'created');
    writer.write('existing.txt', 'unchanged');
    writer.write('another-new.txt', 'also created');

    const stats = writer.getStats();
    assert.equal(stats.written, 2);
    assert.equal(stats.unchanged, 1);
    assert.equal(stats.errors, 0);
  });

  it('returns a snapshot that does not mutate with subsequent writes', () => {
    const writer = createFileWriter({ rootDir: tempRoot });
    writer.write('first.txt', 'content');

    const snapshot = writer.getStats();
    assert.equal(snapshot.written, 1);

    writer.write('second.txt', 'content');

    assert.equal(snapshot.written, 1);

    const latest = writer.getStats();
    assert.equal(latest.written, 2);
  });
});

describe('FileWriter dryRun mode', () => {
  let tempRoot;

  beforeEach(() => {
    tempRoot = createTempRoot();
  });

  afterEach(() => {
    removeTempRoot(tempRoot);
  });

  it('does not write files in dryRun mode', () => {
    const writer = createFileWriter({ rootDir: tempRoot, dryRun: true });
    writer.write('should-not-exist.txt', 'content');

    assert.equal(fs.existsSync(path.join(tempRoot, 'should-not-exist.txt')), false);
  });

  it('does not update stats in dryRun mode', () => {
    const writer = createFileWriter({ rootDir: tempRoot, dryRun: true });
    writer.write('file.txt', 'content');

    const stats = writer.getStats();
    assert.equal(stats.written, 0);
    assert.equal(stats.unchanged, 0);
  });

  it('does not modify existing files in dryRun mode', () => {
    const filePath = path.join(tempRoot, 'preserved.txt');
    fs.writeFileSync(filePath, 'original', 'utf8');

    const writer = createFileWriter({ rootDir: tempRoot, dryRun: true });
    writer.write('preserved.txt', 'modified');

    const content = fs.readFileSync(filePath, 'utf8');
    assert.equal(content, 'original');
  });
});

describe('FileWriter diffMode', () => {
  let tempRoot;

  beforeEach(() => {
    tempRoot = createTempRoot();
  });

  afterEach(() => {
    removeTempRoot(tempRoot);
  });

  it('does not write to the actual output path in diffMode', () => {
    const writer = createFileWriter({ rootDir: tempRoot, diffMode: true });
    writer.write('diff-target.txt', 'content');

    assert.equal(fs.existsSync(path.join(tempRoot, 'diff-target.txt')), false);
  });

  it('does not update stats in diffMode', () => {
    const writer = createFileWriter({ rootDir: tempRoot, diffMode: true });
    writer.write('diff-target.txt', 'content');

    const stats = writer.getStats();
    assert.equal(stats.written, 0);
    assert.equal(stats.unchanged, 0);
  });

  it('does not leave temp files behind after diff', () => {
    const filePath = path.join(tempRoot, 'existing-diff.txt');
    fs.writeFileSync(filePath, 'old content', 'utf8');

    const writer = createFileWriter({ rootDir: tempRoot, diffMode: true });
    writer.write('existing-diff.txt', 'new content');

    const dirContents = fs.readdirSync(tempRoot);
    const tmpFiles = dirContents.filter((f) => f.endsWith('.gen-tmp'));
    assert.equal(tmpFiles.length, 0);
  });
});

describe('FileWriter clean', () => {
  let tempRoot;

  beforeEach(() => {
    tempRoot = createTempRoot();
  });

  afterEach(() => {
    removeTempRoot(tempRoot);
  });

  it('removes specified files that exist', () => {
    const filePath = path.join(tempRoot, 'to-delete.txt');
    fs.writeFileSync(filePath, 'doomed', 'utf8');

    const writer = createFileWriter({ rootDir: tempRoot });
    writer.clean(['to-delete.txt']);

    assert.equal(fs.existsSync(filePath), false);
  });

  it('silently ignores files that do not exist', () => {
    const writer = createFileWriter({ rootDir: tempRoot });

    assert.doesNotThrow(() => {
      writer.clean(['nonexistent.txt']);
    });
  });

  it('removes multiple files in a single call', () => {
    const fileA = path.join(tempRoot, 'a.txt');
    const fileB = path.join(tempRoot, 'b.txt');
    fs.writeFileSync(fileA, 'a', 'utf8');
    fs.writeFileSync(fileB, 'b', 'utf8');

    const writer = createFileWriter({ rootDir: tempRoot });
    writer.clean(['a.txt', 'b.txt']);

    assert.equal(fs.existsSync(fileA), false);
    assert.equal(fs.existsSync(fileB), false);
  });

  it('validates paths through safeResolve', () => {
    const writer = createFileWriter({ rootDir: tempRoot });

    assert.throws(
      () => writer.clean(['../../../etc/passwd']),
      /Path traversal detected/
    );
  });
});
