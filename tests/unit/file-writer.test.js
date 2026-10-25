'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createFileWriter, safeResolve } = require('../../src/generator/file-writer');
const { makeTempDir } = require('../support/fs');

let tempRoot;

beforeEach(() => {
  tempRoot = makeTempDir('maestro-fw-');
});

describe('safeResolve', () => {
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

  it('requires file destinations to be absent or regular files', () => {
    fs.mkdirSync(path.join(tempRoot, 'blocked.js'));
    assert.throws(() => safeResolve('blocked.js', tempRoot, { requireFile: true }), /Expected a regular file/);
    fs.writeFileSync(path.join(tempRoot, 'existing.js'), 'content');
    for (const file of ['existing.js', 'new/created.js']) {
      assert.equal(safeResolve(file, tempRoot, { requireFile: true }), path.join(tempRoot, file));
    }
    assert.equal(safeResolve('blocked.js', tempRoot), path.join(tempRoot, 'blocked.js'));
  });

  it('rejects existing and broken symlink outputs and symlink parents', () => {
    const external = makeTempDir('maestro-fw-external-');
    fs.symlinkSync(external, path.join(tempRoot, 'linked-dir'), 'dir');
    assert.throws(() => safeResolve('linked-dir/new.js', tempRoot), /Symlink path is not allowed/);
    fs.symlinkSync(path.join(external, 'missing.js'), path.join(tempRoot, 'broken.js'));
    assert.throws(() => safeResolve('broken.js', tempRoot), /Symlink path is not allowed/);
    fs.writeFileSync(path.join(external, 'existing.js'), 'original');
    fs.symlinkSync(path.join(external, 'existing.js'), path.join(tempRoot, 'linked.js'));
    assert.throws(() => safeResolve('linked.js', tempRoot), /Symlink path is not allowed/);
    assert.equal(fs.readFileSync(path.join(external, 'existing.js'), 'utf8'), 'original');
  });
});

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

  it('creates a new empty file and leaves an existing empty file unchanged', () => {
    fs.writeFileSync(path.join(tempRoot, 'both-empty.txt'), '', 'utf8');

    const writer = createFileWriter({ rootDir: tempRoot });
    writer.write('empty.txt', '');
    writer.write('both-empty.txt', '');

    assert.equal(fs.readFileSync(path.join(tempRoot, 'empty.txt'), 'utf8'), '');
    const stats = writer.getStats();
    assert.equal(stats.written, 1);
    assert.equal(stats.unchanged, 1);
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
    writer.write('../../../etc/passwd', 'malicious');
    writer.reportError('Source not found: missing.md');
    writer.reportError('processing a.md -> b.md', new Error('boom'));
    const logged = console.error.mock.calls.map((c) => c.arguments[0]);

    assert.equal(writer.getStats().errors, 3);
    assert.deepEqual(logged.slice(1), [
      'ERROR: Source not found: missing.md',
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

  it('restores executable output permissions and reports mode-only drift without writing in previews', {
    skip: process.platform === 'win32',
  }, (t) => {
    const output = { outputPath: 'bin/command.js', content: '#!/usr/bin/env node\n', mode: 0o755 };
    const filePath = path.join(tempRoot, output.outputPath);
    const writer = createFileWriter({ rootDir: tempRoot });
    writer.writeAll([output]);
    assert.equal(fs.statSync(filePath).mode & 0o777, 0o755);
    fs.chmodSync(filePath, 0o644);
    const mtime = fs.statSync(filePath).mtimeMs;
    t.mock.method(console, 'log', () => {});

    for (const options of [{ dryRun: true }, { diffMode: true }]) {
      createFileWriter({ rootDir: tempRoot, ...options }).writeAll([output]);
      assert.equal(fs.statSync(filePath).mode & 0o777, 0o644);
      assert.equal(fs.statSync(filePath).mtimeMs, mtime);
    }
    assert.deepEqual(console.log.mock.calls.map(({ arguments: args }) => args[0]), [
      '[UPDATE] bin/command.js',
      'MODE: bin/command.js -> 755',
    ]);

    writer.writeAll([output]);
    assert.equal(fs.statSync(filePath).mode & 0o777, 0o755);
    assert.equal(fs.statSync(filePath).mtimeMs, mtime);
    assert.equal(writer.getStats().written, 2);
    writer.writeAll([output]);
    assert.equal(writer.getStats().unchanged, 1);
  });
});

describe('FileWriter dryRun mode', () => {
  it('does not write files in dryRun mode', () => {
    const writer = createFileWriter({ rootDir: tempRoot, dryRun: true });
    writer.write('should-not-exist.txt', 'content');

    assert.equal(fs.existsSync(path.join(tempRoot, 'should-not-exist.txt')), false);
  });

  it('counts changed and unchanged outputs without counting writes in dryRun mode', (t) => {
    fs.writeFileSync(path.join(tempRoot, 'same.txt'), 'same', 'utf8');
    t.mock.method(console, 'log', () => {});
    const writer = createFileWriter({ rootDir: tempRoot, dryRun: true });
    writer.write('file.txt', 'content');
    writer.write('same.txt', 'same');

    assert.deepEqual(writer.getStats(), { written: 0, changed: 1, unchanged: 1, errors: 0 });
    assert.deepEqual(console.log.mock.calls.map(({ arguments: args }) => args[0]), [
      '[CREATE] file.txt',
      '[UNCHANGED] same.txt',
    ]);
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
  it('counts a missing diff executable as a preview failure without changing files', (t) => {
    const filePath = path.join(tempRoot, 'existing.txt');
    fs.writeFileSync(filePath, 'old\n');
    t.mock.method(console, 'error', () => {});
    t.mock.method(console, 'log', () => {});
    const savedPath = process.env.PATH;
    try {
      process.env.PATH = tempRoot;
      const writer = createFileWriter({ rootDir: tempRoot, diffMode: true });
      writer.write('existing.txt', 'new\n');
      assert.equal(writer.getStats().errors, 1);
      assert.equal(console.log.mock.calls.length, 0);
      assert.match(console.error.mock.calls[0].arguments[0], /ENOENT/);
      assert.equal(fs.readFileSync(filePath, 'utf8'), 'old\n');
    } finally {
      if (savedPath === undefined) delete process.env.PATH;
      else process.env.PATH = savedPath;
    }
  });

  it('counts diff exit 2 as failure rather than a rendered difference', { skip: process.platform === 'win32' }, (t) => {
    const filePath = path.join(tempRoot, 'existing.txt');
    fs.writeFileSync(filePath, 'old\n');
    fs.writeFileSync(path.join(tempRoot, 'diff'), '#!/bin/sh\nwhile IFS= read -r line; do :; done\nexit 2\n', { mode: 0o755 });
    t.mock.method(console, 'error', () => {});
    t.mock.method(console, 'log', () => {});
    const savedPath = process.env.PATH;
    try {
      process.env.PATH = tempRoot;
      const writer = createFileWriter({ rootDir: tempRoot, diffMode: true });
      writer.write('existing.txt', 'new\n');
      assert.equal(writer.getStats().errors, 1);
      assert.equal(console.log.mock.calls.length, 0);
      assert.match(console.error.mock.calls[0].arguments[0], /Command failed/);
      assert.equal(fs.readFileSync(filePath, 'utf8'), 'old\n');
    } finally {
      if (savedPath === undefined) delete process.env.PATH;
      else process.env.PATH = savedPath;
    }
  });

  it('does not write to the actual output path in diffMode', () => {
    const writer = createFileWriter({ rootDir: tempRoot, diffMode: true });
    writer.write('diff-target.txt', 'content');

    assert.equal(fs.existsSync(path.join(tempRoot, 'diff-target.txt')), false);
  });

  it('counts changed outputs without counting writes in diffMode', (t) => {
    t.mock.method(console, 'log', () => {});
    const writer = createFileWriter({ rootDir: tempRoot, diffMode: true });
    writer.write('diff-target.txt', 'content');

    assert.deepEqual(writer.getStats(), { written: 0, changed: 1, unchanged: 0, errors: 0 });
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

  it('renders an existing-file diff without writing temporary files', (t) => {
    const filePath = path.join(tempRoot, 'existing.txt');
    fs.writeFileSync(filePath, 'old\n');
    t.mock.method(fs, 'writeFileSync', () => { throw new Error('Diff must not write files'); });
    t.mock.method(console, 'log', () => {});
    const writer = createFileWriter({ rootDir: tempRoot, diffMode: true });
    writer.write('existing.txt', 'new\n');
    assert.equal(writer.getStats().errors, 0);
    assert.ok(console.log.mock.calls.some(({ arguments: args }) => String(args[0]).includes('+new')));
  });
});

describe('FileWriter check mode', () => {
  it('logs and counts only outputs that would change, without writing or cleaning', (t) => {
    fs.writeFileSync(path.join(tempRoot, 'same.txt'), 'same', 'utf8');
    fs.writeFileSync(path.join(tempRoot, 'stale.txt'), 'old', 'utf8');
    t.mock.method(console, 'log', () => {});
    const writer = createFileWriter({ rootDir: tempRoot, check: true });
    writer.writeAll([
      { outputPath: 'same.txt', content: 'same' },
      { outputPath: 'stale.txt', content: 'new' },
      { outputPath: 'created.txt', content: 'new' },
    ]);
    writer.clean(['same.txt']);

    assert.deepEqual(console.log.mock.calls.map(({ arguments: args }) => args[0]), [
      '[UPDATE] stale.txt',
      '[CREATE] created.txt',
    ]);
    assert.deepEqual(writer.getStats(), { written: 0, changed: 2, unchanged: 1, errors: 0 });
    assert.equal(fs.readFileSync(path.join(tempRoot, 'stale.txt'), 'utf8'), 'old');
    assert.equal(fs.existsSync(path.join(tempRoot, 'created.txt')), false);
    assert.equal(fs.existsSync(path.join(tempRoot, 'same.txt')), true);
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

  it('validates paths through safeResolve', () => {
    const writer = createFileWriter({ rootDir: tempRoot });

    assert.throws(
      () => writer.clean(['../../../etc/passwd']),
      /Path traversal detected/
    );
  });
});
