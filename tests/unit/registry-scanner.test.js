'use strict';

const { beforeEach, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { collectRegistryOutputs } = require('../../src/generator/registry-scanner');
const { makeTempDir, readJson, writeTree } = require('../support/fs');
const { ROOT } = require('../support/paths');

const SRC = path.join(ROOT, 'src');

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
    const outputs = collectRegistryOutputs(SRC, ROOT);

    assert.deepEqual(outputs.map((o) => o.outputPath), REGISTRY_PATHS);
    for (const { outputPath, content } of outputs) {
      assert.equal(content, fs.readFileSync(path.join(ROOT, outputPath), 'utf8'), outputPath);
    }
  });

  it('registers every committed hook handler with a remaining runtime hook config', () => {
    const hookRegistry = readJson(path.join(ROOT, 'src', 'generated', 'hook-registry.json'));
    const hookConfigs = [
      path.join('antigravity', 'hooks.json'),
      path.join('qwen', 'hooks.json'),
      path.join('claude', 'hooks', 'claude-hooks.json'),
    ];
    assert.equal(fs.existsSync(path.join(ROOT, 'hooks', 'hooks.json')), false);

    const registered = new Set();
    for (const configPath of hookConfigs) {
      const config = fs.readFileSync(path.join(ROOT, configPath), 'utf8');
      for (const [, runtime, hookName] of config.matchAll(/hook-runner\.js (\w+) ([a-z-]+)/g)) {
        assert.ok(['antigravity', 'claude', 'qwen'].includes(runtime), `${configPath}: ${runtime}`);
        registered.add(hookName);
      }
    }

    assert.deepEqual([...registered].sort(), Object.keys(hookRegistry).sort());
  });

  describe('on a fixture src tree', () => {
    let rootDir;
    let srcDir;

    beforeEach(() => {
      rootDir = makeTempDir('maestro-registry-scanner-');
      srcDir = path.join(rootDir, 'src');
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
