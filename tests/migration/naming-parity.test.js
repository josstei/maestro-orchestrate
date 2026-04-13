'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const coreNames = require('../../src/core/agent-names');
const libNaming = require('../../src/lib/naming');

function hookNameToFunctionName(hookName) {
  const pascal = hookName
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  return `handle${pascal}`;
}

const SRC_DIR = path.resolve(__dirname, '..', '..', 'src');
const AGENTS_DIR = path.join(SRC_DIR, 'agents');
const HOOKS_LOGIC_DIR = path.join(SRC_DIR, 'hooks', 'logic');

const agentNames = fs.readdirSync(AGENTS_DIR)
  .filter((f) => f.endsWith('.md'))
  .sort()
  .map((f) => f.replace(/\.md$/, ''));

const hookNames = fs.readdirSync(HOOKS_LOGIC_DIR)
  .filter((f) => f.endsWith('-logic.js'))
  .sort()
  .map((f) => f.replace(/-logic\.js$/, ''));

describe('naming-parity: toSnakeCase()', () => {
  for (const name of agentNames) {
    it(`converts "${name}" identically`, () => {
      const expected = coreNames.toSnakeCase(name);
      const actual = libNaming.toSnakeCase(name);
      assert.strictEqual(actual, expected);
    });
  }
});

describe('naming-parity: toKebabCase()', () => {
  for (const name of agentNames) {
    const snaked = coreNames.toSnakeCase(name);

    it(`round-trips "${name}" via snake_case identically`, () => {
      const expected = coreNames.toKebabCase(snaked);
      const actual = libNaming.toKebabCase(snaked);
      assert.strictEqual(actual, expected);
    });
  }
});

describe('naming-parity: replaceInContent()', () => {
  const sampleContent = agentNames
    .map((name) => `Delegate to ${name} for analysis.`)
    .join('\n');

  it('produces identical snake_case replacement', () => {
    const expected = coreNames.replaceInContent(sampleContent, agentNames, 'snake_case');
    const actual = libNaming.replaceInContent(sampleContent, agentNames, 'snake_case');
    assert.strictEqual(actual, expected);
  });

  it('produces identical kebab-case passthrough', () => {
    const expected = coreNames.replaceInContent(sampleContent, agentNames, 'kebab-case');
    const actual = libNaming.replaceInContent(sampleContent, agentNames, 'kebab-case');
    assert.strictEqual(actual, expected);
  });

  it('handles empty agent list identically', () => {
    const expected = coreNames.replaceInContent(sampleContent, [], 'snake_case');
    const actual = libNaming.replaceInContent(sampleContent, [], 'snake_case');
    assert.strictEqual(actual, expected);
  });

  it('handles null agent list identically', () => {
    const expected = coreNames.replaceInContent(sampleContent, null, 'snake_case');
    const actual = libNaming.replaceInContent(sampleContent, null, 'snake_case');
    assert.strictEqual(actual, expected);
  });
});

describe('naming-parity: toPascalCase() vs hookNameToFunctionName()', () => {
  for (const hookName of hookNames) {
    it(`converts "${hookName}" to matching PascalCase`, () => {
      const oldResult = hookNameToFunctionName(hookName);
      const expectedPascal = oldResult.slice('handle'.length);
      const actual = libNaming.toPascalCase(hookName);
      assert.strictEqual(actual, expectedPascal);
    });
  }
});
