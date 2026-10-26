'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { AGENT_COUNT, PUBLIC_SKILL_COUNT, listCanonicalAgents, publicSkillNames } = require('../support/catalog');
const { readJson } = require('../support/fs');
const { readStubFrontmatter } = require('../support/generated-files');
const { ROOT } = require('../support/paths');
const qwenRuntime = require('../../src/platforms/qwen/runtime-config');
const { toSnakeCase } = require('../../src/lib/naming');

// Qwen Code's extension manager reads an installed extension's subagents only
// from <extension>/agents/*.md and its slash commands from <extension>/commands/,
// where <extension> is the directory holding qwen-extension.json. For Maestro
// that directory is the repo root.
const EXTENSION_DIR = ROOT;

function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
  });
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
    const canonicalAgents = listCanonicalAgents().map(toSnakeCase).sort();
    assert.equal(canonicalAgents.length, AGENT_COUNT);

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
      // Qwen stub keys are snake_case, so a hyphenated key is rejected.
      const frontmatter = readStubFrontmatter(stubPath, { keyPattern: /^([A-Za-z_]+):\s*(.*)$/ });

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

  it(`generates the ${PUBLIC_SKILL_COUNT} TOML commands in <extension>/commands/maestro/`, () => {
    const expectedCommands = publicSkillNames('qwen');
    assert.equal(expectedCommands.length, PUBLIC_SKILL_COUNT);

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
