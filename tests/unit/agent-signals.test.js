'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { CANONICAL_SIGNALS, normalizeSignal } = require('../../src/lib/agent-signals');
const { parse } = require('../../src/lib/frontmatter');

test('CANONICAL_SIGNALS is frozen', () => {
  assert.ok(Object.isFrozen(CANONICAL_SIGNALS));
});

test('CANONICAL_SIGNALS contains no duplicates', () => {
  assert.equal(new Set(CANONICAL_SIGNALS).size, CANONICAL_SIGNALS.length);
});

test('normalizeSignal lowercases input', () => {
  assert.strictEqual(normalizeSignal('A11Y'), 'a11y');
});

test('normalizeSignal converts whitespace runs to single hyphen', () => {
  assert.strictEqual(normalizeSignal('Tech writing'), 'tech-writing');
});

test('normalizeSignal trims leading and trailing whitespace', () => {
  assert.strictEqual(normalizeSignal('  scaffold  '), 'scaffold');
});

test('each agent file has valid non-empty signals from canonical set', () => {
  const agentsDir = path.resolve(__dirname, '../../src/agents');
  const files = fs.readdirSync(agentsDir).filter((f) => f.endsWith('.md'));

  assert.ok(files.length > 0, 'expected at least one agent file');

  for (const file of files) {
    const content = fs.readFileSync(path.join(agentsDir, file), 'utf8');
    const { frontmatter } = parse(content);

    assert.ok(
      Array.isArray(frontmatter.signals),
      `${file}: signals must be an array`
    );
    assert.ok(
      frontmatter.signals.length >= 2,
      `${file}: signals must have at least 2 entries`
    );
    assert.equal(
      new Set(frontmatter.signals).size,
      frontmatter.signals.length,
      `${file}: signals contains duplicates`
    );

    for (const signal of frontmatter.signals) {
      assert.ok(
        CANONICAL_SIGNALS.includes(signal),
        `${file}: signal "${signal}" is not in CANONICAL_SIGNALS`
      );
    }
  }
});
