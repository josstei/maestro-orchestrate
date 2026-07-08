import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../../dist/src/mcp/server/create-mcp-server.js';
import {
  PHASE_ID,
  FILE_ARRAY,
  DOWNSTREAM_CONTEXT,
  PHASE_ITEM,
} from '../../dist/src/mcp/tool-packs/zod-fragments.js';

const moduleDirname = path.dirname(fileURLToPath(import.meta.url));
const goldenDir = path.join(moduleDirname, 'golden');
const EXPECTED_FRAGMENT_GOLDENS = [
  'downstream-context.json',
  'file-array.json',
  'phase-id.json',
  'phase-item.json',
];

test('golden snapshots match zod fragment names', () => {
  const actual = readdirSync(goldenDir)
    .filter((name) => name.endsWith('.json'))
    .sort();
  assert.deepEqual(actual, EXPECTED_FRAGMENT_GOLDENS);
});

function readGolden(name) {
  return JSON.parse(readFileSync(path.join(goldenDir, name), 'utf8'));
}

async function emittedInputSchemaFor(fragment, toolName) {
  const server = createMcpServer();
  server.registerTool(
    toolName,
    { inputSchema: { value: fragment } },
    async () => ({ content: [] }),
  );
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'zod-fragments-test-client', version: '0.0.0' });
  await client.connect(clientTransport);
  const { tools } = await client.listTools();
  const tool = tools.find((entry) => entry.name === toolName);
  await client.close();
  await server.close();
  return tool.inputSchema.properties.value;
}

test('PHASE_ID emitted JSON Schema matches golden snapshot', async () => {
  const emitted = await emittedInputSchemaFor(PHASE_ID, 'probe_phase_id');
  assert.deepEqual(emitted, readGolden('phase-id.json'));
});

test('FILE_ARRAY emitted JSON Schema matches golden snapshot', async () => {
  const emitted = await emittedInputSchemaFor(FILE_ARRAY, 'probe_file_array');
  assert.deepEqual(emitted, readGolden('file-array.json'));
});

test('DOWNSTREAM_CONTEXT emitted JSON Schema matches golden snapshot', async () => {
  const emitted = await emittedInputSchemaFor(DOWNSTREAM_CONTEXT, 'probe_downstream_context');
  assert.deepEqual(emitted, readGolden('downstream-context.json'));
});

test('PHASE_ITEM emitted JSON Schema matches golden snapshot', async () => {
  const emitted = await emittedInputSchemaFor(PHASE_ITEM, 'probe_phase_item');
  assert.deepEqual(emitted, readGolden('phase-item.json'));
});

test('PHASE_ID accepts an integer', () => {
  assert.equal(PHASE_ID.parse(1), 1);
});

test('PHASE_ID accepts a string', () => {
  assert.equal(PHASE_ID.parse('phase-a'), 'phase-a');
});

test('PHASE_ID rejects a boolean', () => {
  assert.throws(() => PHASE_ID.parse(true));
});

test('PHASE_ID rejects an object', () => {
  assert.throws(() => PHASE_ID.parse({ id: 1 }));
});

test('FILE_ARRAY accepts an array of strings', () => {
  assert.deepEqual(FILE_ARRAY.parse(['src/a.js', 'src/b.js']), ['src/a.js', 'src/b.js']);
});

test('FILE_ARRAY rejects an array containing a non-string item', () => {
  assert.throws(() => FILE_ARRAY.parse(['src/a.js', 42]));
});

test('DOWNSTREAM_CONTEXT accepts a field supplied as a plain string', () => {
  const result = DOWNSTREAM_CONTEXT.parse({ warnings: 'none' });
  assert.equal(result.warnings, 'none');
});

test('DOWNSTREAM_CONTEXT accepts a field supplied as a string array', () => {
  const result = DOWNSTREAM_CONTEXT.parse({ warnings: ['a', 'b'] });
  assert.deepEqual(result.warnings, ['a', 'b']);
});

test('DOWNSTREAM_CONTEXT accepts unknown top-level keys and retains them', () => {
  const result = DOWNSTREAM_CONTEXT.parse({ warnings: 'none', totally_unknown_field: 'kept' });
  assert.equal(result.totally_unknown_field, 'kept');
});

test('PHASE_ITEM passthrough accepts an unknown runtime field and retains it', () => {
  const result = PHASE_ITEM.parse({
    id: 1,
    name: 'Phase One',
    agent: 'coder',
    parallel: false,
    blocked_by: [],
    files_created: ['src/new-file.js'],
  });
  assert.deepEqual(result.files_created, ['src/new-file.js']);
});

test('PHASE_ITEM requires blocked_by entries to be valid phase ids', () => {
  assert.throws(() => PHASE_ITEM.parse({
    id: 1,
    name: 'Phase One',
    agent: 'coder',
    parallel: false,
    blocked_by: [true],
  }));
});
