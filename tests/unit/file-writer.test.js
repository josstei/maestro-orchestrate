'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createFileWriter, writeIfChanged } = require('../../src/generator/file-writer');
const { makeTempDir } = require('../support/fs');

let tempRoot;

beforeEach(() => {
  tempRoot = makeTempDir('maestro-fw-');
});

/**
 * A file beside tempRoot for the path-traversal tests, so a broken guard
 * would write or delete this scratch path rather than a system file.
 * @returns {string}
 */
function outsideRoot() {
  return `${tempRoot}-outside.txt`;
}

describe('FileWriter write', () => {
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

  it('refuses relative and absolute paths that escape the root, counting each as an error', (t) => {
    t.mock.method(console, 'error', () => {});
    const outside = outsideRoot();
    const escape = path.relative(tempRoot, outside);
    const writer = createFileWriter({ rootDir: tempRoot });
    writer.write(escape, 'malicious');
    writer.write(outside, 'malicious');

    const stats = writer.getStats();
    assert.equal(stats.errors, 2);
    assert.equal(stats.written, 0);
    assert.equal(fs.existsSync(outside), false);
    assert.deepEqual(console.error.mock.calls.map((c) => c.arguments[0]), [
      `ERROR writing ${escape}: Path traversal detected: "${escape}" resolves outside project root`,
      `ERROR writing ${outside}: Path traversal detected: "${outside}" resolves outside project root`,
    ]);
  });
});

describe('FileWriter getStats', () => {
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

describe('FileWriter reportError', () => {
  it('aggregates reported errors with write errors', (t) => {
    const writer = createFileWriter({ rootDir: tempRoot });
    t.mock.method(console, 'error', () => {});
    writer.write(path.relative(tempRoot, outsideRoot()), 'malicious');
    writer.reportError('cleaning generated files');
    writer.reportError('processing a.md -> b.md', new Error('boom'));
    const logged = console.error.mock.calls.map((c) => c.arguments[0]);

    assert.equal(writer.getStats().errors, 3);
    assert.deepEqual(logged.slice(1), [
      'ERROR: cleaning generated files',
      'ERROR: processing a.md -> b.md: boom',
    ]);
  });
});

describe('FileWriter writeAll', () => {
  it('writes every output in order', () => {
    const writer = createFileWriter({ rootDir: tempRoot });
    writer.writeAll([
      { outputPath: 'a.txt', content: 'a' },
      { outputPath: 'nested/b.txt', content: 'b' },
    ]);

    assert.equal(fs.readFileSync(path.join(tempRoot, 'a.txt'), 'utf8'), 'a');
    assert.equal(fs.readFileSync(path.join(tempRoot, 'nested', 'b.txt'), 'utf8'), 'b');
    assert.equal(writer.getStats().written, 2);
  });
});

describe('FileWriter dryRun mode', () => {
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

  it('does not delete files in dryRun mode', () => {
    const filePath = path.join(tempRoot, 'dry-run-clean.txt');
    fs.writeFileSync(filePath, 'keep', 'utf8');

    const writer = createFileWriter({ rootDir: tempRoot, dryRun: true });
    writer.clean(['dry-run-clean.txt']);

    assert.equal(fs.existsSync(filePath), true);
  });

  it('does not delete files in diffMode', () => {
    const filePath = path.join(tempRoot, 'diff-clean.txt');
    fs.writeFileSync(filePath, 'keep', 'utf8');

    const writer = createFileWriter({ rootDir: tempRoot, diffMode: true });
    writer.clean(['diff-clean.txt']);

    assert.equal(fs.existsSync(filePath), true);
  });

  it('refuses a path that escapes the root', () => {
    const writer = createFileWriter({ rootDir: tempRoot });

    assert.throws(
      () => writer.clean([path.relative(tempRoot, outsideRoot())]),
      /Path traversal detected/
    );
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
