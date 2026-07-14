import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { getRuntimeConfig } from '../../dist/src/mcp/runtime/runtime-config-map.js';
import { buildMcpServer, createContentPack, makeTempWorkspace } from '../support/mcp.js';
import { withExtensionRoot, writeAgent, writeResource } from '../support/content.js';
import { fileURLToPath } from 'node:url';
const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirname = path.dirname(moduleFilename);
const REPO_ROOT = path.resolve(moduleDirname, '..', '..');

describe('content tool pack', () => {
  it('registers the content and runtime metadata tools', async (t) => {
    const server = await buildMcpServer({
      testContext: t,
      runtimeConfig: getRuntimeConfig('claude'),
      services: {
        canonicalSrcRoot: path.join(REPO_ROOT, 'src'),
      },
      toolPacks: [createContentPack],
    });

    const schemas = await server.getToolSchemas();
    assert.deepEqual(
      schemas.map((schema) => schema.name),
      ['get_skill_content', 'get_agent', 'get_runtime_context']
    );
  });

  it('serves skill content, agent content, and runtime context through the pack', async (t) => {
    const root = makeTempWorkspace('maestro-content-pack-', t);
    writeResource(
      path.join(root, 'src'),
      'delegation',
      '---\nname: delegation\ndescription: Demo skill\n---\nUse ${extensionPath} here.\n'
    );
    writeAgent(
      path.join(root, 'src'),
      'coder',
      [
        '---',
        'name: coder',
        'tools: [read_file, write_file]',
        '---',
        'Methodology body.',
      ].join('\n')
    );

    const server = await buildMcpServer({
      testContext: t,
      runtimeConfig: getRuntimeConfig('claude'),
      services: {
        canonicalSrcRoot: path.join(root, 'src'),
      },
      toolPacks: [createContentPack],
    });

    const skillResult = await withExtensionRoot(root, () =>
      server.callTool('get_skill_content', { resources: ['delegation'] })
    );
    const agentResult = await withExtensionRoot(root, () =>
      server.callTool('get_agent', { agents: ['coder'] })
    );
    const contextResult = await server.callTool('get_runtime_context');

    assert.equal(skillResult.ok, true);
    assert.ok(
      skillResult.result.contents.delegation.includes('${CLAUDE_PLUGIN_ROOT}')
    );
    assert.equal(agentResult.ok, true);
    assert.deepEqual(agentResult.result.agents.coder.tools, ['Read', 'Write']);
    assert.equal(contextResult.ok, true);
    assert.equal(
      contextResult.result.mcp_prefix,
      'mcp__plugin_maestro_maestro__'
    );
  });
});
