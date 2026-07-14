import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  GENERATED_SURFACE_INVENTORY,
  OWNED_GENERATED_DIRS,
  RUNTIME_CONTEXT_OUTPUTS,
  TRACKED_OUTPUT_EXEMPTIONS,
} from '../../dist/src/generator/generated-surface-inventory.js';

import { OWNED_GENERATED_DIRS as GENERATE_OWNED_GENERATED_DIRS } from '../../dist/src/tooling/generate.js';
import { RUNTIME_PAYLOAD_CONTRACT } from '../../dist/src/tooling/runtime-payload-contract.js';
import { fileURLToPath } from 'node:url';
const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirname = path.dirname(moduleFilename);
const ROOT = path.resolve(moduleDirname, '../..');

describe('generated surface inventory', () => {
  it('is the generator source for owned dirs', () => {
    assert.deepEqual(GENERATE_OWNED_GENERATED_DIRS, OWNED_GENERATED_DIRS);
  });

  it('covers all current generator producers', () => {
    const producerIds = GENERATED_SURFACE_INVENTORY.map((surface) => surface.id).sort();

    assert.deepEqual(producerIds, [
      'entry-point-expander-outputs',
      'hook-config-outputs',
      'manifest-transform-outputs',
      'owned-directory-pruning',
      'package-and-release-allowlists',
      'platform-metadata-outputs',
      'policy-outputs',
      'registry-outputs',
      'runtime-content-manifest-outputs',
      'runtime-context-outputs',
    ]);
  });

  it('projects runtime context outputs from positive catalog facts', () => {
    assert.deepEqual([...RUNTIME_CONTEXT_OUTPUTS].sort(), [
      'GEMINI.md',
      'QWEN.md',
      'claude/README.md',
      'docs/runtime-claude.md',
      'docs/runtime-codex.md',
      'docs/runtime-gemini.md',
      'docs/runtime-qwen.md',
    ]);
  });

  it('does not attach duplicate source payloads to runtime contracts', () => {
    for (const runtime of RUNTIME_PAYLOAD_CONTRACT) {
      assert.equal(runtime.detachedPayload, undefined, `${runtime.name} duplicates its source payload`);
    }
  });

  it('points to current generated roots', () => {
    assert.ok(
      OWNED_GENERATED_DIRS.includes('qwen/agents'),
      'Qwen generated agent stubs must be stale-pruned'
    );

    for (const ownedDir of OWNED_GENERATED_DIRS) {
      assert.equal(fs.existsSync(path.join(ROOT, ownedDir)), true, `${ownedDir} exists`);
    }
  });

  it('defines the exact set of tracked-output exemptions', () => {
    assert.deepEqual(TRACKED_OUTPUT_EXEMPTIONS, [
      '.agents/plugins/marketplace.json',
      '.claude-plugin/marketplace.json',
      '.claude-plugin/plugin.json',
    ]);
    assert.ok(Object.isFrozen(TRACKED_OUTPUT_EXEMPTIONS));
  });

  it('only marks a surface tracked when it covers a tracked-output exemption', () => {
    for (const surface of GENERATED_SURFACE_INVENTORY) {
      if (surface.id === 'package-and-release-allowlists') {
        continue;
      }

      const coversExemption = surface.outputs.some((output) => TRACKED_OUTPUT_EXEMPTIONS.includes(output));
      assert.equal(
        surface.tracked,
        coversExemption,
        `${surface.id}: tracked=${surface.tracked} coversExemption=${coversExemption}`
      );
    }
  });
});
