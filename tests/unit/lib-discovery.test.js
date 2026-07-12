import { describe, it, beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { discover, generateRegistry, patternToRegex, parsePattern, collectFiles } from '../../dist/src/lib/discovery/index.js';
import { parse } from '../../dist/src/lib/frontmatter/index.js';
import { buildRegistryModel } from '../../dist/src/generator/registry-scanner.js';
import { makeTempSrcRoot, cleanupTempRoots, writeFileUnder } from '../support/content.js';
import { repoPath } from '../support/paths.js';

const SRC_DIR = repoPath('src');
after(cleanupTempRoots);

function createTempRoot() {
  return makeTempSrcRoot('maestro-discovery-');
}

function removeTempRoot(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function writeFile(base, relativePath, content) {
  return writeFileUnder(base, relativePath, content);
}

// ---------------------------------------------------------------------------
// patternToRegex
// ---------------------------------------------------------------------------

describe('patternToRegex', () => {
  it('matches wildcard prefix with extension', () => {
    const re = patternToRegex('*.md');
    assert.ok(re.test('readme.md'));
    assert.ok(re.test('SKILL.md'));
    assert.ok(!re.test('readme.txt'));
    assert.ok(!re.test('sub/readme.md'));
  });

  it('matches wildcard suffix pattern', () => {
    const re = patternToRegex('*-logic.js');
    assert.ok(re.test('session-start-logic.js'));
    assert.ok(re.test('before-agent-logic.js'));
    assert.ok(!re.test('hook-state.js'));
    assert.ok(!re.test('session-start-logic.ts'));
  });

  it('matches bare wildcard', () => {
    const re = patternToRegex('*');
    assert.ok(re.test('anything'));
    assert.ok(re.test('file.txt'));
    assert.ok(!re.test('a/b'));
  });

  it('escapes regex-special characters in the pattern', () => {
    const re = patternToRegex('file.test.js');
    assert.ok(re.test('file.test.js'));
    assert.ok(!re.test('filextest.js'));
    assert.ok(!re.test('filextestxjs'));
  });

  it('anchors to full filename', () => {
    const re = patternToRegex('*.js');
    assert.ok(!re.test('file.js.bak'));
    assert.ok(re.test('file.js'));
  });
});

// ---------------------------------------------------------------------------
// parsePattern
// ---------------------------------------------------------------------------

describe('parsePattern', () => {
  it('returns impliedRecursive false for flat pattern', () => {
    const result = parsePattern('*.md');
    assert.equal(result.impliedRecursive, false);
    assert.ok(result.regex instanceof RegExp);
  });

  it('strips **/ prefix and sets impliedRecursive true', () => {
    const result = parsePattern('**/*.md');
    assert.equal(result.impliedRecursive, true);
    assert.ok(result.regex.test('readme.md'));
    assert.ok(!result.regex.test('readme.txt'));
  });

  it('handles suffix pattern without recursive prefix', () => {
    const result = parsePattern('*-logic.js');
    assert.equal(result.impliedRecursive, false);
    assert.ok(result.regex.test('session-start-logic.js'));
    assert.ok(!result.regex.test('hook-state.js'));
  });
});

// ---------------------------------------------------------------------------
// collectFiles
// ---------------------------------------------------------------------------

describe('collectFiles', () => {
  let tempRoot;

  beforeEach(() => {
    tempRoot = createTempRoot();
  });

  afterEach(() => {
    removeTempRoot(tempRoot);
  });

  it('returns empty array for nonexistent directory', () => {
    const result = collectFiles(path.join(tempRoot, 'nope'), false);
    assert.deepEqual(result, []);
  });

  it('collects files from a flat directory', () => {
    writeFile(tempRoot, 'a.txt', 'a');
    writeFile(tempRoot, 'b.txt', 'b');
    const result = collectFiles(tempRoot, false).map((p) => path.basename(p)).sort();
    assert.deepEqual(result, ['a.txt', 'b.txt']);
  });

  it('does not recurse when recursive is false', () => {
    writeFile(tempRoot, 'top.txt', 'top');
    writeFile(tempRoot, 'sub/nested.txt', 'nested');
    const result = collectFiles(tempRoot, false).map((p) => path.basename(p));
    assert.deepEqual(result, ['top.txt']);
  });

  it('recurses into subdirectories when recursive is true', () => {
    writeFile(tempRoot, 'top.txt', 'top');
    writeFile(tempRoot, 'sub/nested.txt', 'nested');
    writeFile(tempRoot, 'sub/deep/deeper.txt', 'deeper');
    const result = collectFiles(tempRoot, true).map((p) => path.basename(p)).sort();
    assert.deepEqual(result, ['deeper.txt', 'nested.txt', 'top.txt']);
  });

  it('returns empty array for empty directory', () => {
    const emptyDir = path.join(tempRoot, 'empty');
    fs.mkdirSync(emptyDir);
    assert.deepEqual(collectFiles(emptyDir, false), []);
  });
});

// ---------------------------------------------------------------------------
// discover — contract tests
// ---------------------------------------------------------------------------

describe('discover', () => {
  let tempRoot;

  beforeEach(() => {
    tempRoot = createTempRoot();
  });

  afterEach(() => {
    removeTempRoot(tempRoot);
  });

  it('discovers files matching a simple extension pattern', () => {
    writeFile(tempRoot, 'one.md', '# One');
    writeFile(tempRoot, 'two.md', '# Two');
    writeFile(tempRoot, 'skip.txt', 'text');

    const entries = discover({
      dir: tempRoot,
      pattern: '*.md',
      identity: (fp) => path.basename(fp, '.md'),
    });

    assert.equal(entries.length, 2);
    assert.equal(entries[0].id, 'one');
    assert.equal(entries[1].id, 'two');
  });

  it('discovers files matching a suffix pattern', () => {
    writeFile(tempRoot, 'session-start-logic.js', '');
    writeFile(tempRoot, 'before-agent-logic.js', '');
    writeFile(tempRoot, 'hook-state.js', '');

    const entries = discover({
      dir: tempRoot,
      pattern: '*-logic.js',
      identity: (fp) => path.basename(fp).replace(/-logic\.js$/, ''),
    });

    assert.equal(entries.length, 2);
    assert.deepEqual(
      entries.map((e) => e.id),
      ['before-agent', 'session-start']
    );
  });

  it('sorts entries by id', () => {
    writeFile(tempRoot, 'charlie.md', '');
    writeFile(tempRoot, 'alpha.md', '');
    writeFile(tempRoot, 'bravo.md', '');

    const entries = discover({
      dir: tempRoot,
      pattern: '*.md',
      identity: (fp) => path.basename(fp, '.md'),
    });

    assert.deepEqual(
      entries.map((e) => e.id),
      ['alpha', 'bravo', 'charlie']
    );
  });

  it('includes absolute path on each entry', () => {
    const written = writeFile(tempRoot, 'item.md', '');

    const entries = discover({
      dir: tempRoot,
      pattern: '*.md',
      identity: (fp) => path.basename(fp, '.md'),
    });

    assert.equal(entries[0].path, written);
  });

  it('extracts metadata when callback is provided', () => {
    writeFile(tempRoot, 'agent.md', '---\nname: coder\ncapabilities: full\n---\nbody');

    const entries = discover({
      dir: tempRoot,
      pattern: '*.md',
      identity: (fp) => path.basename(fp, '.md'),
      metadata: (_fp, content) => {
        const { frontmatter } = parse(content);
        return { name: frontmatter.name, capabilities: frontmatter.capabilities };
      },
    });

    assert.equal(entries[0].name, 'coder');
    assert.equal(entries[0].capabilities, 'full');
  });

  it('does not read file content when metadata callback is absent', () => {
    writeFile(tempRoot, 'noop.md', 'content');

    const originalReadFileSync = fs.readFileSync;
    let readCalled = false;
    fs.readFileSync = function (...args) {
      if (typeof args[0] === 'string' && args[0].includes('noop.md')) {
        readCalled = true;
      }
      return originalReadFileSync.apply(fs, args);
    };

    try {
      discover({
        dir: tempRoot,
        pattern: '*.md',
        identity: (fp) => path.basename(fp, '.md'),
      });
      assert.equal(readCalled, false);
    } finally {
      fs.readFileSync = originalReadFileSync;
    }
  });

  it('filters entries via validate callback', () => {
    writeFile(tempRoot, 'keep.md', '');
    writeFile(tempRoot, 'drop.md', '');

    const entries = discover({
      dir: tempRoot,
      pattern: '*.md',
      identity: (fp) => path.basename(fp, '.md'),
      validate: (entry) => entry.id !== 'drop',
    });

    assert.equal(entries.length, 1);
    assert.equal(entries[0].id, 'keep');
  });

  it('handles recursive scanning via recursive option', () => {
    writeFile(tempRoot, 'top.md', '');
    writeFile(tempRoot, 'sub/nested.md', '');
    writeFile(tempRoot, 'sub/deep/leaf.md', '');

    const entries = discover({
      dir: tempRoot,
      pattern: '*.md',
      identity: (fp) => path.basename(fp, '.md'),
      recursive: true,
    });

    assert.equal(entries.length, 3);
    assert.deepEqual(
      entries.map((e) => e.id),
      ['leaf', 'nested', 'top']
    );
  });

  it('handles recursive scanning via **/ pattern prefix', () => {
    writeFile(tempRoot, 'top.md', '');
    writeFile(tempRoot, 'sub/nested.md', '');

    const entries = discover({
      dir: tempRoot,
      pattern: '**/*.md',
      identity: (fp) => path.basename(fp, '.md'),
    });

    assert.equal(entries.length, 2);
    assert.deepEqual(
      entries.map((e) => e.id),
      ['nested', 'top']
    );
  });

  it('returns empty array for nonexistent directory', () => {
    const entries = discover({
      dir: path.join(tempRoot, 'nonexistent'),
      pattern: '*.md',
      identity: (fp) => path.basename(fp, '.md'),
    });

    assert.deepEqual(entries, []);
  });

  it('returns empty array when no files match pattern', () => {
    writeFile(tempRoot, 'file.txt', 'text');

    const entries = discover({
      dir: tempRoot,
      pattern: '*.md',
      identity: (fp) => path.basename(fp, '.md'),
    });

    assert.deepEqual(entries, []);
  });

  it('handles metadata callback returning null gracefully', () => {
    writeFile(tempRoot, 'item.md', 'content');

    const entries = discover({
      dir: tempRoot,
      pattern: '*.md',
      identity: (fp) => path.basename(fp, '.md'),
      metadata: () => null,
    });

    assert.equal(entries.length, 1);
    assert.equal(entries[0].id, 'item');
    assert.ok('path' in entries[0]);
  });

  it('spreads metadata properties onto the entry', () => {
    writeFile(tempRoot, 'item.md', '');

    const entries = discover({
      dir: tempRoot,
      pattern: '*.md',
      identity: (fp) => path.basename(fp, '.md'),
      metadata: () => ({ extra: 'value', count: 42 }),
    });

    assert.equal(entries[0].extra, 'value');
    assert.equal(entries[0].count, 42);
  });
});

// ---------------------------------------------------------------------------
// generateRegistry
// ---------------------------------------------------------------------------

describe('generateRegistry', () => {
  let tempRoot;

  beforeEach(() => {
    tempRoot = createTempRoot();
  });

  afterEach(() => {
    removeTempRoot(tempRoot);
  });

  it('writes JSON array with trailing newline', () => {
    const outputPath = path.join(tempRoot, 'registry.json');
    generateRegistry([{ id: 'a' }, { id: 'b' }], outputPath);
    const content = fs.readFileSync(outputPath, 'utf8');
    assert.ok(content.endsWith('\n'));
    assert.deepEqual(JSON.parse(content), [{ id: 'a' }, { id: 'b' }]);
  });

  it('writes JSON object with trailing newline', () => {
    const outputPath = path.join(tempRoot, 'hooks.json');
    generateRegistry({ 'session-start': { module: 'm', fn: 'f' } }, outputPath);
    const content = fs.readFileSync(outputPath, 'utf8');
    assert.deepEqual(JSON.parse(content), { 'session-start': { module: 'm', fn: 'f' } });
  });

  it('uses 2-space indentation', () => {
    const outputPath = path.join(tempRoot, 'indent.json');
    generateRegistry({ key: 'value' }, outputPath);
    const content = fs.readFileSync(outputPath, 'utf8');
    assert.ok(content.includes('  "key"'));
  });

  it('returns true when file is new', () => {
    const outputPath = path.join(tempRoot, 'new.json');
    const result = generateRegistry([], outputPath);
    assert.equal(result, true);
  });

  it('returns false when content is identical', () => {
    const outputPath = path.join(tempRoot, 'same.json');
    generateRegistry({ a: 1 }, outputPath);
    const result = generateRegistry({ a: 1 }, outputPath);
    assert.equal(result, false);
  });

  it('creates parent directories', () => {
    const outputPath = path.join(tempRoot, 'deep', 'nested', 'registry.json');
    generateRegistry([], outputPath);
    assert.ok(fs.existsSync(outputPath));
  });
});

// ---------------------------------------------------------------------------
// module exports
// ---------------------------------------------------------------------------

describe('module exports', () => {
  it('exports discover and generateRegistry as functions', () => {
    assert.equal(typeof discover, 'function');
    assert.equal(typeof generateRegistry, 'function');
  });

  it('exports internal helpers for testing', () => {
    assert.equal(typeof patternToRegex, 'function');
    assert.equal(typeof parsePattern, 'function');
    assert.equal(typeof collectFiles, 'function');
  });
});

// ---------------------------------------------------------------------------
// Parity tests — verify the derived model reproduces final registry projections
// ---------------------------------------------------------------------------

describe('registry model parity', () => {
  const model = buildRegistryModel(SRC_DIR);

  for (const [fileName, actual] of [
    ['agent-registry.json', model.agents],
    ['hook-registry.json', model.hooks],
    ['resource-registry.json', model.resources],
  ]) {
    it(`reproduces src/generated/${fileName}`, () => {
      const expected = JSON.parse(
        fs.readFileSync(path.join(SRC_DIR, 'generated', fileName), 'utf8')
      );
      assert.deepEqual(actual, expected);
    });
  }
});
