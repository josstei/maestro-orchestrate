'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  validateCrossReferences,
  assertCrossReferences,
} = require('../../src/generator/cross-reference-validator');

const REPO_SRC = path.resolve(__dirname, '..', '..', 'src');

const base = {
  agentNames: ['code-reviewer'],
  resourceIds: ['delegation', 'architecture', 'orchestration-steps'],
  entryPoints: [
    { name: 'review', agents: ['code-reviewer'], skills: ['delegation'], refs: ['architecture'] },
  ],
  coreCommands: [{ name: 'orchestrate', preload: ['orchestration-steps'] }],
};

describe('validateCrossReferences', () => {
  it('passes when every reference resolves', () => {
    assert.doesNotThrow(() => validateCrossReferences(base));
  });

  it('throws on an unknown agent', () => {
    const bad = { ...base, entryPoints: [{ name: 'review', agents: ['code-reviewr'], skills: [], refs: [] }] };
    assert.throws(() => validateCrossReferences(bad), /unknown agent "code-reviewr"/);
  });

  it('throws on an unknown skill and an unknown ref', () => {
    const badSkill = { ...base, entryPoints: [{ name: 'x', agents: [], skills: ['nope'], refs: [] }] };
    assert.throws(() => validateCrossReferences(badSkill), /unknown skill\/resource "nope"/);
    const badRef = { ...base, entryPoints: [{ name: 'x', agents: [], skills: [], refs: ['gone'] }] };
    assert.throws(() => validateCrossReferences(badRef), /unknown ref\/resource "gone"/);
  });

  it('throws on an unknown core-command preload', () => {
    const bad = { ...base, coreCommands: [{ name: 'execute', preload: ['missing'] }] };
    assert.throws(() => validateCrossReferences(bad), /preloads unknown resource "missing"/);
  });

  it('tolerates empty reference arrays', () => {
    const empty = { ...base, entryPoints: [{ name: 'archive', agents: [], skills: [], refs: [] }] };
    assert.doesNotThrow(() => validateCrossReferences(empty));
  });
});

describe('assertCrossReferences on the live tree', () => {
  it('resolves every reference in the real src/', () => {
    assert.doesNotThrow(() => assertCrossReferences(REPO_SRC));
  });
});
