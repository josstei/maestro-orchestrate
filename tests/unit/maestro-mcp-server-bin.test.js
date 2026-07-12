import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { withMcpServer } from '../integration/mcp-stdio-client.js';
const BIN_RELATIVE_PATH = 'dist/src/bin/maestro-mcp-server.js';

function resolveRuntime(env) {
  return withMcpServer(
    { relativePath: BIN_RELATIVE_PATH, env },
    async (client) => {
      const result = await client.callTool('get_runtime_context', {});
      return result.parsed.runtime;
    }
  );
}

describe('dist/src/bin/maestro-mcp-server.js runtime resolution', () => {
  it('resolves as gemini when MAESTRO_RUNTIME=gemini', async () => {
    const runtime = await resolveRuntime({ MAESTRO_RUNTIME: 'gemini' });

    assert.equal(runtime, 'gemini');
  });

  it('resolves as qwen when MAESTRO_RUNTIME=qwen', async () => {
    const runtime = await resolveRuntime({ MAESTRO_RUNTIME: 'qwen' });

    assert.equal(runtime, 'qwen');
  });

  it('resolves as claude when MAESTRO_RUNTIME=claude', async () => {
    const runtime = await resolveRuntime({ MAESTRO_RUNTIME: 'claude' });

    assert.equal(runtime, 'claude');
  });

  it('defaults to codex when MAESTRO_RUNTIME is unset', async () => {
    const runtime = await resolveRuntime({ MAESTRO_RUNTIME: undefined });

    assert.equal(runtime, 'codex');
  });
});
