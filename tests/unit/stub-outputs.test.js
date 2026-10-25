'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { collectStubOutputs } = require('../../src/generator/stub-outputs');
const { RUNTIME_NAMES, getRuntimeConfig } = require('../../src/platforms/runtime-config-map');
const { makeTempDir, writeTree } = require('../support/fs');
const { ROOT, SRC_ROOT } = require('../support/paths');
const { AGENT_COUNT, SHARED_SKILL_COUNT } = require('../support/catalog');

const runtimes = Object.fromEntries(RUNTIME_NAMES.map((name) => [name, getRuntimeConfig(name)]));
const source = (name) => `---\nname: ${name}\ndescription: Example\ntools: [read_file]\n---\nBody.\n`;
const unexpectedError = (message, error) => { throw new Error(message, { cause: error }); };

describe('collectStubOutputs', () => {
  it('preserves source order, host order, nested skills and Qwen agent naming', () => {
    const root = makeTempDir('maestro-stubs-');
    writeTree(root, 'agents/z-last.md', source('z-last'));
    writeTree(root, 'agents/code-reviewer.md', source('code-reviewer'));
    writeTree(root, 'agents/shared/ignored.md', source('ignored'));
    writeTree(root, 'skills/shared/nested/topic/SKILL.md', source('topic'));
    writeTree(root, 'skills/shared/nested/protocol.md', 'not a stub');
    const outputs = collectStubOutputs(root, runtimes, unexpectedError);
    assert.deepEqual(outputs.map(({ outputPath }) => outputPath), [
      'antigravity/agents/code-reviewer.md', 'claude/agents/code-reviewer.md', 'agents/code_reviewer.md',
      'antigravity/agents/z-last.md', 'claude/agents/z-last.md', 'agents/z_last.md',
      'antigravity/skills/nested/topic/SKILL.md', 'claude/skills/nested/topic/SKILL.md',
      'plugins/maestro/skills/nested/topic/SKILL.md',
    ]);
    assert.match(outputs[2].content, /name: code_reviewer/);
    assert.match(outputs[7].content, /user-invocable: false/);
    assert.match(outputs[6].content, /disable-slash-command: true/);
  });

  it('reproduces every committed agent and shared-skill stub exactly', () => {
    const outputs = collectStubOutputs(SRC_ROOT, runtimes, unexpectedError);
    assert.equal(outputs.length, (AGENT_COUNT + SHARED_SKILL_COUNT) * 3);
    assert.equal(new Set(outputs.map(({ outputPath }) => outputPath)).size, outputs.length);
    for (const { outputPath, content } of outputs) {
      assert.equal(content, fs.readFileSync(path.join(ROOT, outputPath), 'utf8'), outputPath);
    }
  });

  it('renders CRLF copies of an agent and a shared skill like the committed LF stubs', () => {
    const root = makeTempDir('maestro-stubs-crlf-');
    for (const file of ['agents/code-reviewer.md', 'skills/shared/delegation/SKILL.md']) {
      writeTree(root, file, fs.readFileSync(path.join(SRC_ROOT, file), 'utf8').replace(/\n/g, '\r\n'));
    }
    const outputs = collectStubOutputs(root, runtimes, unexpectedError);
    assert.equal(outputs.length, 6);
    for (const { outputPath, content } of outputs) {
      assert.equal(content, fs.readFileSync(path.join(ROOT, outputPath), 'utf8'), outputPath);
    }
  });

  it('collects renderer failures without losing successful outputs or changing source files', () => {
    const root = makeTempDir('maestro-stubs-errors-');
    const broken = source('broken') + '<example>\nunclosed\n';
    writeTree(root, 'agents/broken.md', broken);
    const errors = [];
    const outputs = collectStubOutputs(root, runtimes, (message, error) => errors.push([message, error.message]));
    assert.deepEqual(outputs.map(({ outputPath }) => outputPath), ['antigravity/agents/broken.md', 'agents/broken.md']);
    assert.deepEqual(errors, [[
      `processing ${path.join('agents', 'broken.md')} -> claude/agents/broken.md`,
      'Unclosed <example> tag in agent body',
    ]]);
    assert.equal(fs.readFileSync(path.join(root, 'agents/broken.md'), 'utf8'), broken);
  });

  it('returns no outputs for an empty source tree', () => {
    assert.deepEqual(collectStubOutputs(makeTempDir('maestro-stubs-empty-'), runtimes, unexpectedError), []);
  });
});
