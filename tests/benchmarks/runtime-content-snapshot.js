import path from 'node:path';
import { performance } from 'node:perf_hooks';
import {
  AGENT_ALLOWLIST,
  RESOURCE_ALLOWLIST,
  createRuntimeContentSnapshot,
} from '../../dist/src/mcp/content/runtime-content-snapshot.js';

const srcRoot = path.join(process.cwd(), 'dist', 'src');

function measure(run) {
  const startedAt = performance.now();
  const result = run();
  return { milliseconds: performance.now() - startedAt, result };
}

function assertRawContent(result, label) {
  if (!result || result.error || typeof result.content !== 'string') {
    throw new Error(`${label} did not return runtime content`);
  }
}

const cold = measure(() => {
  const snapshot = createRuntimeContentSnapshot(srcRoot);
  const result = snapshot.readResource('delegation');
  assertRawContent(result, 'cold lookup');
  return 1;
});

const warmSnapshot = createRuntimeContentSnapshot(srcRoot);
assertRawContent(warmSnapshot.readResource('delegation'), 'warmup lookup');
const single = measure(() => {
  const result = warmSnapshot.readResource('delegation');
  assertRawContent(result, 'single lookup');
  return 1;
});

const batch = measure(() => {
  const snapshot = createRuntimeContentSnapshot(srcRoot);
  let count = 0;
  for (const id of Object.keys(RESOURCE_ALLOWLIST)) {
    assertRawContent(snapshot.readResource(id), `resource ${id}`);
    count += 1;
  }
  for (const name of AGENT_ALLOWLIST) {
    assertRawContent(snapshot.readAgent(name), `agent ${name}`);
    count += 1;
  }
  return count;
});

console.log(JSON.stringify({
  diagnostic: 'runtime-content-snapshot',
  unit: 'milliseconds',
  cold: { lookups: cold.result, elapsed: cold.milliseconds },
  single: { lookups: single.result, elapsed: single.milliseconds },
  batch: { lookups: batch.result, elapsed: batch.milliseconds },
}, null, 2));
