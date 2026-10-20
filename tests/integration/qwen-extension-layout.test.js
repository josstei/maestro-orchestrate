'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { readJson } = require('../support/fs');
const { ROOT } = require('./helpers');
const qwenRuntime = require('../../src/platforms/qwen/runtime-config');
const entryPointRegistry = require('../../src/entry-points/registry');
const coreCommandRegistry = require('../../src/entry-points/core-command-registry');
const { toSnakeCase } = require('../../src/lib/naming');

// Qwen Code's extension manager reads an installed extension's subagents only
// from <extension>/agents/*.md and its slash commands from <extension>/commands/,
// where <extension> is the directory holding qwen-extension.json. For Maestro
// that directory is the repo root.
const EXTENSION_DIR = ROOT;
const SRC_AGENTS_DIR = path.join(ROOT, 'src', 'agents');

function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
  });
}

/** Reads the scalar keys and the `tools:` block list of a generated agent stub. */
function readStubFrontmatter(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  assert.equal(lines[0], '---', `${filePath}: missing opening frontmatter fence`);
  const closingIdx = lines.indexOf('---', 1);
  assert.notEqual(closingIdx, -1, `${filePath}: missing closing frontmatter fence`);

  const frontmatter = {};
  let listKey = null;
  for (const line of lines.slice(1, closingIdx)) {
    const item = line.match(/^ {2}- (.+)$/);
    if (item && listKey) {
      frontmatter[listKey].push(item[1]);
      continue;
    }
    const [, key, value] = line.match(/^([A-Za-z_]+):\s*(.*)$/) || [];
    assert.ok(key, `${filePath}: unexpected frontmatter line ${JSON.stringify(line)}`);
    listKey = value === '' ? key : null;
    frontmatter[key] = value === '' ? [] : value;
  }
  return frontmatter;
}

describe('qwen extension layout', () => {
  const manifest = readJson(path.join(EXTENSION_DIR, 'qwen-extension.json'));

  it('keeps qwen-extension.json and its context file at the extension root', () => {
    assert.equal(manifest.name, 'maestro');
    assert.equal(manifest.contextFileName, 'QWEN.md');
    assert.ok(
      fs.statSync(path.join(EXTENSION_DIR, manifest.contextFileName)).isFile(),
      'Expected QWEN.md next to qwen-extension.json'
    );
  });

  it('generates one snake_case agent stub per canonical agent in <extension>/agents/', () => {
    const canonicalAgents = fs
      .readdirSync(SRC_AGENTS_DIR)
      .filter((file) => file.endsWith('.md'))
      .map((file) => toSnakeCase(path.basename(file, '.md')))
      .sort();
    assert.equal(canonicalAgents.length, 39);

    const agentsDir = path.join(EXTENSION_DIR, 'agents');
    const entries = fs.readdirSync(agentsDir, { withFileTypes: true });
    assert.deepEqual(
      entries.filter((entry) => !entry.isFile()).map((entry) => entry.name),
      [],
      'Qwen Code only reads top-level files in agents/'
    );
    assert.deepEqual(
      entries.map((entry) => entry.name).sort(),
      canonicalAgents.map((name) => `${name}.md`)
    );

    const qwenToolNames = new Set(Object.values(qwenRuntime.tools));
    const renamedTools = Object.keys(qwenRuntime.tools).filter(
      (tool) => qwenRuntime.tools[tool] !== tool
    );
    for (const tool of ['replace', 'write_todos', 'activate_skill', 'ask_user', 'google_web_search']) {
      assert.ok(renamedTools.includes(tool), `Expected qwen runtime-config to map ${tool}`);
    }

    for (const name of canonicalAgents) {
      const stubPath = path.join(agentsDir, `${name}.md`);
      const frontmatter = readStubFrontmatter(stubPath);

      assert.equal(frontmatter.name, name, stubPath);
      assert.equal(frontmatter.kind, 'local', stubPath);
      assert.ok(frontmatter.description, `${stubPath}: missing description`);
      assert.match(frontmatter.max_turns, /^\d+$/, `${stubPath}: max_turns`);
      assert.equal(frontmatter.temperature, undefined, `${stubPath}: temperature`);
      assert.equal(frontmatter.timeout_mins, undefined, `${stubPath}: timeout_mins`);

      assert.ok(Array.isArray(frontmatter.tools), `${stubPath}: tools must be a block list`);
      assert.ok(frontmatter.tools.length > 0, `${stubPath}: no tools`);
      for (const tool of frontmatter.tools) {
        assert.ok(qwenToolNames.has(tool), `${stubPath}: ${tool} is not a Qwen tool name`);
        assert.ok(!renamedTools.includes(tool), `${stubPath}: unmapped canonical tool ${tool}`);
      }
    }
  });

  it('generates no agent stubs under qwen/', () => {
    assert.equal(fs.existsSync(path.join(EXTENSION_DIR, 'qwen', 'agents')), false);
    assert.deepEqual(
      listFiles(path.join(EXTENSION_DIR, 'qwen'))
        .filter((file) => file.endsWith('.md'))
        .map((file) => path.relative(ROOT, file)),
      []
    );
  });

  it('generates the 12 TOML commands in <extension>/commands/maestro/', () => {
    const expectedCommands = [...entryPointRegistry, ...coreCommandRegistry]
      .map((entry) => entry.runtimeNames?.qwen || entry.name)
      .sort();
    assert.equal(expectedCommands.length, 12);

    const commandsDir = path.join(EXTENSION_DIR, 'commands', 'maestro');
    assert.deepEqual(
      fs.readdirSync(commandsDir).sort(),
      expectedCommands.map((name) => `${name}.toml`)
    );
  });

  it('resolves the MCP server path in qwen-extension.json against the extension root', () => {
    const server = manifest.mcpServers.maestro;
    assert.deepEqual(server.args, ['${extensionPath}/mcp/maestro-server.js']);
    assert.equal(server.cwd, '${extensionPath}');

    const serverPath = server.args[0].replace('${extensionPath}', EXTENSION_DIR);
    assert.ok(fs.statSync(serverPath).isFile(), `Expected ${serverPath} to exist`);
  });
});
