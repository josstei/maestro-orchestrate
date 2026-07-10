import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  validateCrossReferences,
  collectCrossReferenceInputs,
  assertCrossReferences,
} from '../../dist/src/generator/cross-reference-validator.js';
import { buildRegistryModel } from '../../dist/src/generator/registry-scanner.js';
import { fileURLToPath } from 'node:url';
const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirname = path.dirname(moduleFilename);
const REPO_SRC = path.resolve(moduleDirname, '..', '..', 'src');

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
  it('collects agent and resource identities from an injected model', async () => {
    const inputs = await collectCrossReferenceInputs({
      agents: [{ name: 'injected-agent', capabilities: 'read_only', tools: [], focus: 'fixture' }],
      resources: { 'injected-resource': 'references/fixture.md' },
      hooks: {},
    });

    assert.deepEqual(inputs.agentNames, ['injected-agent']);
    assert.deepEqual(inputs.resourceIds, ['injected-resource']);
  });

  it('resolves every reference in the real src/', async () => {
    await assert.doesNotReject(() => assertCrossReferences(buildRegistryModel(REPO_SRC)));
  });
});
