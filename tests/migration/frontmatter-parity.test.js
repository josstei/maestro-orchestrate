'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const coreFrontmatter = require('../../src/core/frontmatter-parser');
const libFrontmatter = require('../../src/lib/frontmatter');

const SRC_DIR = path.resolve(__dirname, '..', '..', 'src');
const AGENTS_DIR = path.join(SRC_DIR, 'agents');
const SKILLS_DIR = path.join(SRC_DIR, 'skills', 'shared');

function collectMarkdownFiles(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectMarkdownFiles(fullPath));
    } else if (entry.name.endsWith('.md')) {
      results.push(fullPath);
    }
  }

  return results.sort();
}

const agentFiles = fs.readdirSync(AGENTS_DIR)
  .filter((f) => f.endsWith('.md'))
  .sort()
  .map((f) => path.join(AGENTS_DIR, f));

const skillFiles = collectMarkdownFiles(SKILLS_DIR);

const allFiles = [...agentFiles, ...skillFiles];

describe('frontmatter-parity: parse()', () => {
  for (const filePath of allFiles) {
    const label = path.relative(SRC_DIR, filePath);

    it(`produces identical output for ${label}`, () => {
      const content = fs.readFileSync(filePath, 'utf8');
      const expected = coreFrontmatter.parse(content);
      const actual = libFrontmatter.parse(content);
      assert.deepStrictEqual(actual.frontmatter, expected.frontmatter);
      assert.strictEqual(actual.body, expected.body);
    });
  }
});

describe('frontmatter-parity: parseFrontmatterOnly()', () => {
  for (const filePath of allFiles) {
    const label = path.relative(SRC_DIR, filePath);

    it(`produces identical frontmatter for ${label}`, () => {
      const content = fs.readFileSync(filePath, 'utf8');
      const expectedFm = coreFrontmatter.parseFrontmatterOnly(content);
      const actual = libFrontmatter.parseFrontmatterOnly(content);
      assert.deepStrictEqual(actual.frontmatter, expectedFm);
    });
  }
});

describe('frontmatter-parity: extractValue()', () => {
  const keys = ['name', 'description', 'capabilities'];

  for (const filePath of allFiles) {
    const label = path.relative(SRC_DIR, filePath);

    for (const key of keys) {
      it(`extracts "${key}" identically for ${label}`, () => {
        const content = fs.readFileSync(filePath, 'utf8');
        const expected = coreFrontmatter.extractValue(content, key);
        const actual = libFrontmatter.extractValue(content, key);
        assert.strictEqual(actual, expected);
      });
    }
  }
});

describe('frontmatter-parity: splitAtBoundary() reconstruction', () => {
  for (const filePath of allFiles) {
    const label = path.relative(SRC_DIR, filePath);

    it(`reconstructs original content for ${label}`, () => {
      const content = fs.readFileSync(filePath, 'utf8');
      const { raw, body } = libFrontmatter.splitAtBoundary(content);

      if (raw === '') {
        assert.strictEqual(body, content);
        return;
      }

      const reconstructed = '---\n' + raw + '\n---\n' + body;
      assert.strictEqual(reconstructed, content);
    });
  }
});
