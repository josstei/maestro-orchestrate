'use strict';

const { afterEach, beforeEach, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { collectRegistryOutputs } = require('../../src/generator/registry-scanner');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(ROOT, 'src');

const REGISTRY_PATHS = [
  path.join('src', 'generated', 'agent-registry.json'),
  path.join('src', 'generated', 'resource-registry.json'),
  path.join('src', 'generated', 'hook-registry.json'),
];

function writeFile(base, relativePath, content) {
  const full = path.join(base, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

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

  describe('on a fixture src tree', () => {
    let rootDir;
    let srcDir;

    beforeEach(() => {
      rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-registry-scanner-'));
      srcDir = path.join(rootDir, 'src');
    });

    afterEach(() => {
      fs.rmSync(rootDir, { recursive: true, force: true });
    });

    it('derives each agent tool tier from its tools, ignoring any declared capabilities', () => {
      writeFile(srcDir, 'agents/reader.md', agentSource('reader', ['read_file', 'glob'], ['capabilities: full']));
      writeFile(srcDir, 'agents/runner.md', agentSource('runner', ['read_file', 'run_shell_command']));
      writeFile(srcDir, 'agents/editor.md', agentSource('editor', ['read_file', 'replace']));
      writeFile(srcDir, 'agents/writer.md', agentSource('writer', ['write_file']));
      writeFile(srcDir, 'agents/builder.md', agentSource('builder', ['write_file', 'run_shell_command']));
      writeFile(srcDir, 'agents/unnamed.md', '---\ndescription: "No name or tools."\n---\nBody.\n');

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
      writeFile(srcDir, 'hooks/logic/session-start-logic.js', '');
      writeFile(srcDir, 'hooks/logic/after-agent-logic.js', '');
      writeFile(srcDir, 'hooks/logic/hook-state.js', '');

      const outputs = collectRegistryOutputs(srcDir, rootDir);

      assert.deepEqual(registryData(outputs, 'hook-registry.json'), {
        'after-agent': { module: 'hooks/logic/after-agent-logic.js', fn: 'handleAfterAgent' },
        'session-start': { module: 'hooks/logic/session-start-logic.js', fn: 'handleSessionStart' },
      });
    });

    it('keys skills by directory name and other resources by file name', () => {
      writeFile(srcDir, 'skills/shared/delegation/SKILL.md', '# Delegation');
      writeFile(srcDir, 'skills/shared/delegation/protocols/base-protocol.md', '# Protocol');
      writeFile(srcDir, 'templates/design-document.md', '# Template');
      writeFile(srcDir, 'templates/nested/ignored.md', '# Not scanned');
      writeFile(srcDir, 'references/architecture.md', '# Reference');

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
