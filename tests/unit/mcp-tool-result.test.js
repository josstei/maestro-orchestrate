import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createToolFailure, createToolSuccess, normalizeToolError } from '../../dist/src/mcp/server/tool-outcome.js';
import { toolOutcomeToCallToolResult } from '../../dist/src/mcp/server/tool-result.js';

test('serializes a success ToolOutcome to a non-error CallToolResult', () => {
  const outcome = createToolSuccess({ ok: true, value: 42 });
  const result = toolOutcomeToCallToolResult(outcome);

  assert.equal(result.isError, undefined);
  assert.equal(result.content.length, 1);
  assert.equal(result.content[0].type, 'text');
  assert.deepEqual(JSON.parse(result.content[0].text), { ok: true, value: 42 });
});

test('serializes a failure ToolOutcome preserving error/recovery_hint/code/details, isError true', () => {
  const outcome = createToolFailure({
    error: 'something broke',
    code: 'SOME_CODE',
    recovery_hint: 'try again',
    details: { field: 'name' },
  });
  const result = toolOutcomeToCallToolResult(outcome);

  assert.equal(result.isError, true);
  const payload = JSON.parse(result.content[0].text);
  assert.equal(payload.error, 'something broke');
  assert.equal(payload.recovery_hint, 'try again');
  assert.equal(payload.code, 'SOME_CODE');
  assert.deepEqual(payload.details, { field: 'name' });
});

test('failure without code/details omits those fields but keeps recovery_hint null when absent', () => {
  const outcome = createToolFailure({ error: 'boom' });
  const result = toolOutcomeToCallToolResult(outcome);

  assert.equal(result.isError, true);
  const payload = JSON.parse(result.content[0].text);
  assert.equal(payload.error, 'boom');
  assert.equal(payload.recovery_hint, null);
  assert.equal('code' in payload, false);
  assert.equal('details' in payload, false);
});

test('normalizes a thrown non-Error object with a message without changing the envelope', () => {
  const outcome = normalizeToolError('probe_tool', { message: '/tmp/private failed' });
  const result = toolOutcomeToCallToolResult(outcome);

  assert.equal(result.isError, true);
  const payload = JSON.parse(result.content[0].text);
  assert.equal(payload.error, '[path] failed');
  assert.equal(payload.code, 'INTERNAL_TOOL_ERROR');
});
