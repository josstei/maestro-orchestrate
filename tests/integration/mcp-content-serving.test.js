'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { makeTempDir } = require('../support/fs');
const { HOST_CLIENTS } = require('../support/host-clients');
const { ROOT } = require('./helpers');
const { spawnMcpServer } = require('./mcp-stdio-client');

/**
 * Copies the Qwen server shim, src/ and package.json into a temp dir, so a
 * test can change the content the server reads from its own src/.
 */
function copyServerTree() {
  const root = makeTempDir('maestro-content-serving-');
  for (const entry of ['mcp', 'src', 'package.json']) {
    fs.cpSync(path.join(ROOT, entry), path.join(root, entry), { recursive: true });
  }
  return root;
}

async function withCodexServer(root, fn, env = {}) {
  const client = spawnMcpServer({
    cwd: root,
    relativePath: 'mcp/maestro-server.js',
    clientInfo: HOST_CLIENTS.codex,
    env,
    requestTimeoutMs: 10000,
  });
  try {
    await client.ready;
    await client.initialize();
    return await fn(client);
  } finally {
    await client.close();
  }
}

describe('mcp content serving from the server src/', () => {
  it('serves its own src/ wherever MAESTRO_EXTENSION_PATH points', async () => {
    const root = copyServerTree();
    const marker = '\nServed from the copied server tree.\n';
    fs.appendFileSync(path.join(root, 'src', 'skills', 'shared', 'delegation', 'SKILL.md'), marker);

    // Another Maestro tree, and a directory with no Maestro tree above it.
    for (const extensionPath of [ROOT, makeTempDir('maestro-no-extension-')]) {
      await withCodexServer(root, async (client) => {
        const { contents, errors } = (await client.callTool('get_skill_content', { resources: ['delegation'] })).parsed;
        assert.deepEqual(errors, {}, extensionPath);
        assert.ok(contents.delegation.endsWith(marker), extensionPath);
      }, { MAESTRO_EXTENSION_PATH: extensionPath });
    }
  });

  it('reads content at call time and reports each unreadable resource or agent per id', async () => {
    const root = copyServerTree();
    const src = path.join(root, 'src');

    await withCodexServer(root, async (client) => {
      fs.rmSync(path.join(src, 'skills', 'shared', 'delegation', 'SKILL.md'));
      const skills = (await client.callTool('get_skill_content', { resources: ['delegation', 'execution'] })).parsed;
      assert.deepEqual(skills.errors, { delegation: 'Failed to read resource "delegation": ENOENT' });
      assert.deepEqual(Object.keys(skills.contents), ['execution']);

      fs.rmSync(path.join(src, 'agents', 'architect.md'));
      const missingAgent = (await client.callTool('get_agent', { agents: ['architect', 'coder'] })).parsed;
      assert.deepEqual(missingAgent.errors, { architect: 'Failed to read agent "architect": ENOENT' });
      assert.deepEqual(Object.keys(missingAgent.agents), ['coder']);

      // The Output Contract fragment is part of every agent read.
      fs.rmSync(path.join(src, 'agents', 'shared', 'handoff-report.md'));
      const missingContract = (await client.callTool('get_agent', { agents: ['code_reviewer'] })).parsed;
      assert.deepEqual(missingContract.agents, {});
      assert.deepEqual(missingContract.errors, { code_reviewer: 'Failed to read agent "code-reviewer": ENOENT' });
    });
  });

  it('fails the read of content that names an undefined feature flag', async () => {
    const root = copyServerTree();
    const src = path.join(root, 'src');
    const unknownBlock = '<!-- @feature noSuchFlag -->\nhidden\n<!-- @end-feature -->\n';
    fs.appendFileSync(path.join(src, 'references', 'architecture.md'), unknownBlock);
    fs.appendFileSync(path.join(src, 'agents', 'coder.md'), unknownBlock);

    await withCodexServer(root, async (client) => {
      const skills = (await client.callTool('get_skill_content', { resources: ['architecture'] })).parsed;
      assert.deepEqual(skills.errors, { architecture: 'Failed to read resource "architecture": UNKNOWN' });

      const agents = (await client.callTool('get_agent', { agents: ['coder', 'tester'] })).parsed;
      assert.deepEqual(agents.errors, { coder: 'Failed to read agent "coder": UNKNOWN' });
      assert.deepEqual(Object.keys(agents.agents), ['tester']);
    });
  });

  it('collapses the blank lines a stripped feature block leaves, across the frontmatter boundary', async () => {
    const root = copyServerTree();
    const src = path.join(root, 'src');
    const outputContract = fs.readFileSync(path.join(src, 'agents', 'shared', 'handoff-report.md'), 'utf8');
    fs.writeFileSync(
      path.join(src, 'agents', 'debugger.md'),
      [
        '---',
        'name: debugger',
        'tools: [read_file]',
        '---',
        '',
        '<!-- @feature exampleBlocks -->',
        'Example only some runtimes serve.',
        '<!-- @end-feature -->',
        '',
        '',
        'Methodology body.',
        '',
      ].join('\n')
    );

    await withCodexServer(root, async (client) => {
      const { agents, errors } = (await client.callTool('get_agent', { agents: ['debugger'] })).parsed;
      assert.deepEqual(errors, {});
      assert.equal(agents.debugger.body, `\nMethodology body.\n\n${outputContract}`);
      assert.deepEqual(agents.debugger.tools, ['direct file reads']);
    });
  });
});
