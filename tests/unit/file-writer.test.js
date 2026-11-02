'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { FileWriter, safeResolve } = require('../../src/generator/file-writer');
const { withEnv } = require('../support/env');
const { makeTempDir, writeTree } = require('../support/fs');

let tempRoot;
const read = (file) => fs.readFileSync(path.join(tempRoot, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(tempRoot, file));
const logged = (method) => method.mock.calls.map(({ arguments: args }) => args[0]);

beforeEach(() => {
  tempRoot = makeTempDir('maestro-fw-');
});

describe('safeResolve', () => {
  it('resolves in-root paths, including the root itself, and rejects relative and absolute escapes', () => {
    assert.equal(safeResolve('sub/file.txt', tempRoot), path.join(tempRoot, 'sub', 'file.txt'));
    assert.equal(safeResolve('.', tempRoot), tempRoot);
    for (const escape of ['../../../etc/passwd', '/etc/passwd']) {
      assert.throws(() => safeResolve(escape, tempRoot), /Path traversal detected/);
    }
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
  it('creates files and parent directories, updates changed content and leaves unchanged files untouched', () => {
    for (const [file, content] of [['same.txt', 'same'], ['update.txt', 'old'], ['both-empty.txt', '']]) {
      fs.writeFileSync(path.join(tempRoot, file), content);
    }
    const mtime = fs.statSync(path.join(tempRoot, 'same.txt')).mtimeMs;
    const writer = new FileWriter({ rootDir: tempRoot });
    writer.writeAll([
      { outputPath: 'deep/nested/dir/file.txt', content: 'deep' },
      { outputPath: 'same.txt', content: 'same' },
      { outputPath: 'update.txt', content: 'new' },
      { outputPath: 'empty.txt', content: '' },
      { outputPath: 'both-empty.txt', content: '' },
    ]);
    assert.deepEqual(['deep/nested/dir/file.txt', 'update.txt', 'empty.txt'].map(read), ['deep', 'new', '']);
    assert.equal(fs.statSync(path.join(tempRoot, 'same.txt')).mtimeMs, mtime);
    assert.deepEqual(writer.stats, { changed: 3, unchanged: 2, errors: 0 });
  });

  it('counts failed writes and reported errors together', (t) => {
    const writer = new FileWriter({ rootDir: tempRoot });
    t.mock.method(console, 'error', () => {});
    writer.write('../../../etc/passwd', 'malicious');
    writer.reportError('Source not found: missing.md');
    writer.reportError('processing a.md -> b.md', new Error('boom'));

    assert.deepEqual(writer.stats, { changed: 0, unchanged: 0, errors: 3 });
    assert.deepEqual(logged(console.error).slice(1), [
      'ERROR: Source not found: missing.md',
      'ERROR: processing a.md -> b.md: boom',
    ]);
  });

  it('restores executable output permissions and reports mode-only drift without writing in previews', {
    skip: process.platform === 'win32',
  }, (t) => {
    const output = { outputPath: 'bin/command.js', content: '#!/usr/bin/env node\n', mode: 0o755 };
    const filePath = path.join(tempRoot, output.outputPath);
    const writer = new FileWriter({ rootDir: tempRoot });
    writer.writeAll([output]);
    assert.equal(fs.statSync(filePath).mode & 0o777, 0o755);
    fs.chmodSync(filePath, 0o644);
    const mtime = fs.statSync(filePath).mtimeMs;
    t.mock.method(console, 'log', () => {});

    for (const options of [{ dryRun: true }, { diffMode: true }]) {
      new FileWriter({ rootDir: tempRoot, ...options }).writeAll([output]);
      assert.equal(fs.statSync(filePath).mode & 0o777, 0o644);
      assert.equal(fs.statSync(filePath).mtimeMs, mtime);
    }
    assert.deepEqual(logged(console.log), ['[UPDATE] bin/command.js', 'MODE: bin/command.js -> 755']);

    writer.writeAll([output]);
    assert.equal(fs.statSync(filePath).mode & 0o777, 0o755);
    assert.equal(fs.statSync(filePath).mtimeMs, mtime);
    assert.equal(writer.stats.changed, 2);
    writer.writeAll([output]);
    assert.equal(writer.stats.unchanged, 1);
    fs.chmodSync(filePath, 0o775);
    writer.writeAll([output]);
    assert.equal(writer.stats.unchanged, 2);
    assert.equal(fs.statSync(filePath).mode & 0o777, 0o775);
  });
});

describe('FileWriter previews', () => {
  it('neither creates nor modifies files in dryRun mode', (t) => {
    fs.writeFileSync(path.join(tempRoot, 'preserved.txt'), 'original');
    t.mock.method(console, 'log', () => {});
    new FileWriter({ rootDir: tempRoot, dryRun: true }).writeAll([
      { outputPath: 'should-not-exist.txt', content: 'content' },
      { outputPath: 'preserved.txt', content: 'modified' },
    ]);
    assert.equal(exists('should-not-exist.txt'), false);
    assert.equal(read('preserved.txt'), 'original');
  });

  it('counts a missing or failing diff executable as a preview failure without changing files', (t) => {
    fs.writeFileSync(path.join(tempRoot, 'existing.txt'), 'old\n');
    const cases = [[/ENOENT/], [/Command failed/, '#!/bin/sh\nwhile IFS= read -r line; do :; done\nexit 2\n']];
    // Mock once: mocking a method twice in one test leaves it unrestored afterwards.
    const error = t.mock.method(console, 'error', () => {});
    const log = t.mock.method(console, 'log', () => {});
    // No diff is on PATH at first, then one that exits 2; that one needs a POSIX shell.
    for (const [message, diffScript] of process.platform === 'win32' ? cases.slice(0, 1) : cases) {
      if (diffScript) fs.writeFileSync(path.join(tempRoot, 'diff'), diffScript, { mode: 0o755 });
      const writer = new FileWriter({ rootDir: tempRoot, diffMode: true });
      withEnv({ PATH: tempRoot }, () => writer.write('existing.txt', 'new\n'));
      assert.equal(writer.stats.errors, 1);
      assert.equal(log.mock.calls.length, 0);
      assert.match(error.mock.calls.at(-1).arguments[0], message);
      assert.equal(read('existing.txt'), 'old\n');
    }
  });

  it('renders diffs for existing files and marks new ones without writing anything', (t) => {
    fs.writeFileSync(path.join(tempRoot, 'existing.txt'), 'old\n');
    t.mock.method(fs, 'writeFileSync', () => { throw new Error('Diff must not write files'); });
    t.mock.method(console, 'log', () => {});
    const writer = new FileWriter({ rootDir: tempRoot, diffMode: true });
    writer.writeAll([
      { outputPath: 'existing.txt', content: 'new\n' },
      { outputPath: 'diff-target.txt', content: 'content' },
    ]);
    assert.equal(writer.stats.errors, 0);
    assert.ok(logged(console.log).some((line) => String(line).includes('+new')));
    assert.ok(logged(console.log).includes('+++ NEW: diff-target.txt'));
    assert.deepEqual(fs.readdirSync(tempRoot), ['existing.txt']);
  });

  it('logs and counts only outputs that would change in check mode, without writing or cleaning', (t) => {
    fs.writeFileSync(path.join(tempRoot, 'same.txt'), 'same', 'utf8');
    fs.writeFileSync(path.join(tempRoot, 'stale.txt'), 'old', 'utf8');
    t.mock.method(console, 'log', () => {});
    const writer = new FileWriter({ rootDir: tempRoot, check: true });
    writer.writeAll([
      { outputPath: 'same.txt', content: 'same' },
      { outputPath: 'stale.txt', content: 'new' },
      { outputPath: 'created.txt', content: 'new' },
    ]);
    writer.clean(['same.txt']);

    assert.deepEqual(logged(console.log), ['[UPDATE] stale.txt', '[CREATE] created.txt']);
    assert.deepEqual(writer.stats, { changed: 2, unchanged: 1, errors: 0 });
    assert.equal(read('stale.txt'), 'old');
    assert.equal(exists('created.txt'), false);
    assert.equal(exists('same.txt'), true);
  });
});

describe('FileWriter clean', () => {
  it('removes existing files, ignores missing ones and rejects paths outside the root', () => {
    for (const file of ['a.txt', 'b.txt']) fs.writeFileSync(path.join(tempRoot, file), file);
    new FileWriter({ rootDir: tempRoot }).clean(['a.txt', 'b.txt', 'nonexistent.txt']);
    assert.equal(exists('a.txt') || exists('b.txt'), false);
    assert.throws(() => new FileWriter({ rootDir: tempRoot }).clean(['../../../etc/passwd']),
      /Path traversal detected/);
  });

  it('keeps files in dryRun and diff modes', () => {
    fs.writeFileSync(path.join(tempRoot, 'keep.txt'), 'keep');
    for (const options of [{ dryRun: true }, { diffMode: true }]) {
      new FileWriter({ rootDir: tempRoot, ...options }).clean(['keep.txt']);
    }
    assert.equal(exists('keep.txt'), true);
  });
});

describe('FileWriter findStale and prune', () => {
  const outputs = ['agents/kept.md', 'agents/sub/keep.md', 'antigravity/skills/orchestrate/SKILL.md']
    .map((outputPath) => ({ outputPath, content: '' }));
  const ownedDirs = ['agents', 'antigravity/skills', 'commands', 'missing/dir'];
  const STALE = [
    'agents/nested/deep/stale.md', 'agents/stale.md', 'agents/sub/stale.md',
    'antigravity/skills/retired/SKILL.md', 'commands/stale.toml',
  ];
  const UNOWNED = ['antigravity/README.md', 'claude/agents/legacy.md'];

  beforeEach(() => {
    for (const file of [...outputs.map(({ outputPath }) => outputPath), ...STALE, ...UNOWNED]) {
      writeTree(tempRoot, file, 'content');
    }
  });

  it('deletes only unproduced files in owned directories and the subdirectories they empty', (t) => {
    t.mock.method(console, 'log', () => {});
    const writer = new FileWriter({ rootDir: tempRoot });
    const stale = writer.findStale(outputs, ownedDirs);
    assert.deepEqual(stale.files, STALE);
    writer.prune(stale);
    for (const file of [...STALE, 'agents/nested', 'antigravity/skills/retired']) {
      assert.equal(exists(file), false, file);
    }
    // An emptied owned directory itself stays.
    for (const file of [...outputs.map(({ outputPath }) => outputPath), ...UNOWNED, 'commands']) {
      assert.equal(exists(file), true, file);
    }
    assert.deepEqual(logged(console.log), STALE.map((file) => `  PRUNED: ${file}`));
    assert.deepEqual(writer.findStale(outputs, ownedDirs).files, []);
  });

  it('only reports stale files in previews, as [REMOVE] whenever dry-run or check is set', (t) => {
    t.mock.method(console, 'log', () => {});
    for (const options of [{ check: true, diffMode: true }, { diffMode: true }]) {
      const writer = new FileWriter({ rootDir: tempRoot, ...options });
      writer.prune(writer.findStale(outputs, ownedDirs));
    }
    for (const file of STALE) assert.equal(exists(file), true, file);
    assert.deepEqual(logged(console.log), [
      ...STALE.map((file) => `[REMOVE] ${file}`),
      ...STALE.map((file) => `--- REMOVED: ${file}`),
    ]);
  });
});
