'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { loadAgentRoster } = require('../../src/lib/agent-loader');

test('loads real src/agents/ directory and returns >= 39 entries', () => {
  const roster = loadAgentRoster();
  assert.ok(Array.isArray(roster), 'result is an array');
  assert.ok(roster.length >= 39, `expected >= 39 agents, got ${roster.length}`);
  for (const entry of roster) {
    assert.ok(typeof entry.name === 'string', 'entry has name string');
    assert.ok(typeof entry.frontmatter === 'object' && entry.frontmatter !== null, 'entry has frontmatter object');
    assert.ok(typeof entry.body === 'string', 'entry has body string');
  }
  const coder = roster.find((e) => e.name === 'coder');
  assert.ok(coder !== undefined, 'coder agent is present in roster');
});

test('loads agents from an explicit agentsDir with two markdown files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-loader-'));
  try {
    fs.writeFileSync(path.join(dir, 'alpha.md'), '---\nname: alpha\ntier: read_only\n---\nalpha body');
    fs.writeFileSync(path.join(dir, 'beta.md'), '---\nname: beta\ntier: full\n---\nbeta body');

    const roster = loadAgentRoster(dir);
    assert.equal(roster.length, 2);

    const alpha = roster.find((e) => e.name === 'alpha');
    assert.ok(alpha !== undefined, 'alpha entry present');
    assert.equal(alpha.frontmatter.name, 'alpha');
    assert.equal(alpha.frontmatter.tier, 'read_only');
    assert.equal(alpha.body, 'alpha body');

    const beta = roster.find((e) => e.name === 'beta');
    assert.ok(beta !== undefined, 'beta entry present');
    assert.equal(beta.frontmatter.name, 'beta');
    assert.equal(beta.frontmatter.tier, 'full');
    assert.equal(beta.body, 'beta body');
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
});

test('filters out non-.md files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-loader-'));
  try {
    fs.writeFileSync(path.join(dir, 'valid.md'), '---\nname: valid\n---\nvalid body');
    fs.writeFileSync(path.join(dir, 'README.txt'), 'plain text file');
    fs.writeFileSync(path.join(dir, 'not-markdown.json'), '{"key": "value"}');

    const roster = loadAgentRoster(dir);
    assert.equal(roster.length, 1);
    assert.equal(roster[0].name, 'valid');
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
});

test('name is the kebab-case basename without extension', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-loader-'));
  try {
    fs.writeFileSync(path.join(dir, 'my-agent.md'), '---\nname: my-agent\n---\nbody');

    const roster = loadAgentRoster(dir);
    assert.equal(roster.length, 1);
    assert.equal(roster[0].name, 'my-agent');
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
});

test('reads body text correctly from frontmatter-delimited content', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-loader-'));
  try {
    fs.writeFileSync(path.join(dir, 'x.md'), '---\nname: x\n---\nbody text');

    const roster = loadAgentRoster(dir);
    assert.equal(roster.length, 1);
    assert.equal(roster[0].body, 'body text');
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
});
