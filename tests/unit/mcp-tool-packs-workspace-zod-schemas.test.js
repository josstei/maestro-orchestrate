import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../../dist/src/mcp/server/create-mcp-server.js';
import { zodSchemas } from '../../dist/src/mcp/tool-packs/workspace/zod-schemas.js';

const moduleDirname = path.dirname(fileURLToPath(import.meta.url));
const goldenDir = path.join(moduleDirname, 'golden', 'tool-packs', 'workspace');

function readGolden(toolName) {
  return JSON.parse(readFileSync(path.join(goldenDir, `${toolName}.json`), 'utf8'));
}

async function emittedInputSchemaFor(toolName) {
  const server = createMcpServer();
  server.registerTool(
    toolName,
    { inputSchema: zodSchemas[toolName] },
    async () => ({ content: [] }),
  );
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'workspace-zod-schemas-test-client', version: '0.0.0' });
  await client.connect(clientTransport);
  const { tools } = await client.listTools();
  const tool = tools.find((entry) => entry.name === toolName);
  await client.close();
  await server.close();
  return tool.inputSchema;
}

for (const toolName of Object.keys(zodSchemas)) {
  test(`${toolName} emitted JSON Schema matches golden snapshot`, async () => {
    const emitted = await emittedInputSchemaFor(toolName);
    assert.deepEqual(emitted, readGolden(toolName));
  });
}

test('validate_plan requires plan and task_complexity', () => {
  const shape = zodSchemas.validate_plan;
  assert.throws(() => shape.plan.parse(undefined));
  assert.throws(() => shape.task_complexity.parse(undefined));
});

test('validate_plan.plan accepts an arbitrary free-form object', () => {
  const result = zodSchemas.validate_plan.plan.parse({ anything: 'goes', nested: { a: 1 } });
  assert.deepEqual(result, { anything: 'goes', nested: { a: 1 } });
});

test('validate_plan.task_complexity rejects a value outside the enum', () => {
  assert.throws(() => zodSchemas.validate_plan.task_complexity.parse('extreme'));
});

test('initialize_workspace.workspace_path is required', () => {
  assert.throws(() => zodSchemas.initialize_workspace.workspace_path.parse(undefined));
});

test('initialize_workspace.state_dir is optional', () => {
  assert.equal(zodSchemas.initialize_workspace.state_dir.parse(undefined), undefined);
});
