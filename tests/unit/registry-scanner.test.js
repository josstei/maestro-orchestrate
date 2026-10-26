'use strict';

const { beforeEach, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { collectRegistryOutputs } = require('../../src/generator/registry-scanner');
const { makeTempDir, writeTree } = require('../support/fs');
const { ROOT, SRC_ROOT } = require('../support/paths');

const REGISTRY_PATHS = [
  path.join('src', 'generated', 'agent-registry.json'),
  path.join('src', 'generated', 'resource-registry.json'),
  path.join('src', 'generated', 'hook-registry.json'),
];

function agentSource(name, tools, extraLines = []) {
  return ['---', `name: ${name}`, `tools: [${tools.join(', ')}]`, ...extraLines, '---', 'Body.', ''].join('\n');
}

function registryData(outputs, fileName) {
  const output = outputs.find((o) => path.basename(o.outputPath) === fileName);
  return JSON.parse(output.content);
}

describe('collectRegistryOutputs', () => {
  it('reproduces the committed src/generated registries', () => {
    const outputs = collectRegistryOutputs(SRC_ROOT, ROOT);

    assert.deepEqual(outputs.map((o) => o.outputPath), REGISTRY_PATHS);
    for (const { outputPath, content } of outputs) {
      assert.equal(content, fs.readFileSync(path.join(ROOT, outputPath), 'utf8'), outputPath);
    }
  });

  describe('on a fixture src tree', () => {
    let rootDir;
    let srcDir;

    beforeEach(() => {
      rootDir = makeTempDir('maestro-registry-scanner-');
      srcDir = path.join(rootDir, 'src');
    });

    it('preserves stable resource-ID ties and later category precedence without reading resource bodies', (t) => {
      writeTree(srcDir, 'skills/shared/a/SKILL.md', 'first a');
      writeTree(srcDir, 'skills/shared/a.md', 'later a');
      writeTree(srcDir, 'skills/shared/shared.md', 'skill');
      writeTree(srcDir, 'templates/shared.md', 'template');
      writeTree(srcDir, 'references/shared.md', 'reference');
      const agent = writeTree(srcDir, 'agents/only.md', agentSource('only', ['read_file']));
      const read = fs.readFileSync;
      const reads = [];
      t.mock.method(fs, 'readFileSync', (file, ...args) => { reads.push(file); return read(file, ...args); });
      const resources = registryData(collectRegistryOutputs(srcDir, rootDir), 'resource-registry.json');
      assert.deepEqual(resources, { a: 'skills/shared/a.md', shared: 'references/shared.md' });
      assert.deepEqual(Object.keys(resources), ['a', 'shared']);
      assert.deepEqual(reads, [agent]);
    });

    it('derives each agent tool tier from its tools, ignoring any declared capabilities', () => {
      writeTree(srcDir, 'agents/reader.md', agentSource('reader', ['read_file', 'glob'], ['capabilities: full']));
      writeTree(srcDir, 'agents/runner.md', agentSource('runner', ['read_file', 'run_shell_command']));
      writeTree(srcDir, 'agents/editor.md', agentSource('editor', ['read_file', 'replace']));
      writeTree(srcDir, 'agents/writer.md', agentSource('writer', ['write_file']));
      writeTree(srcDir, 'agents/builder.md', agentSource('builder', ['write_file', 'run_shell_command']));
      writeTree(srcDir, 'agents/unnamed.md', '---\ndescription: "No name or tools."\n---\nBody.\n');

      const outputs = collectRegistryOutputs(srcDir, rootDir);

      assert.deepEqual(registryData(outputs, 'agent-registry.json'), [
        { name: 'builder', capabilities: 'full' },
        { name: 'editor', capabilities: 'read_write' },
        { name: 'reader', capabilities: 'read_only' },
        { name: 'runner', capabilities: 'read_shell' },
        { name: 'unnamed', capabilities: 'read_only' },
        { name: 'writer', capabilities: 'read_write' },
      ]);
    });

    it('names hook handlers handle<PascalCase> after their *-logic.js module', () => {
      writeTree(srcDir, 'hooks/logic/session-start-logic.js', '');
      writeTree(srcDir, 'hooks/logic/after-agent-logic.js', '');
      writeTree(srcDir, 'hooks/logic/hook-state.js', '');

      const outputs = collectRegistryOutputs(srcDir, rootDir);

      assert.deepEqual(registryData(outputs, 'hook-registry.json'), {
        'after-agent': { module: 'hooks/logic/after-agent-logic.js', fn: 'handleAfterAgent' },
        'session-start': { module: 'hooks/logic/session-start-logic.js', fn: 'handleSessionStart' },
      });
    });

    it('keys skills by directory name and other resources by file name', () => {
      writeTree(srcDir, 'skills/shared/delegation/SKILL.md', '# Delegation');
      writeTree(srcDir, 'skills/shared/delegation/protocols/base-protocol.md', '# Protocol');
      writeTree(srcDir, 'templates/design-document.md', '# Template');
      writeTree(srcDir, 'templates/nested/ignored.md', '# Not scanned');
      writeTree(srcDir, 'references/architecture.md', '# Reference');

      const outputs = collectRegistryOutputs(srcDir, rootDir);

      assert.deepEqual(registryData(outputs, 'resource-registry.json'), {
        'base-protocol': 'skills/shared/delegation/protocols/base-protocol.md',
        delegation: 'skills/shared/delegation/SKILL.md',
        'design-document': 'templates/design-document.md',
        architecture: 'references/architecture.md',
      });
    });
  });
});
