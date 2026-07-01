'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  GENERATED_SURFACE_INVENTORY,
  LIVE_OWNED_GENERATED_DIRS,
  OWNED_GENERATED_DIRS,
  RETIRED_GENERATED_CLEANUP_DIRS,
} = require('../../src/generator/generated-surface-inventory');
const {
  OWNED_GENERATED_DIRS: GENERATE_OWNED_GENERATED_DIRS,
} = require('../../scripts/generate');
const { RUNTIME_PAYLOAD_CONTRACT } = require('../../src/platforms/runtime-payload-contract');

const ROOT = path.resolve(__dirname, '../..');

describe('generated surface inventory', () => {
  it('is the generator source for owned dirs', () => {
    assert.deepEqual(GENERATE_OWNED_GENERATED_DIRS, OWNED_GENERATED_DIRS);
  });

  it('covers all current generator producers', () => {
    const producerIds = GENERATED_SURFACE_INVENTORY.map((surface) => surface.id).sort();

    assert.deepEqual(producerIds, [
      'entry-point-expander-outputs',
      'manifest-transform-outputs',
      'owned-directory-pruning',
      'package-and-release-allowlists',
      'platform-metadata-outputs',
      'registry-outputs',
      'retired-generated-cleanup-roots',
    ]);
  });

  it('keeps detached payloads retired in runtime payload contracts', () => {
    const contractPaths = RUNTIME_PAYLOAD_CONTRACT
      .map((runtime) => runtime.detachedPayload.path)
      .filter(Boolean)
      .sort();

    assert.deepEqual(contractPaths, []);
  });

  it('points to existing tracked generated roots and retired cleanup roots', () => {
    assert.ok(
      LIVE_OWNED_GENERATED_DIRS.includes('qwen/agents'),
      'Qwen generated agent stubs must be stale-pruned'
    );
    assert.ok(
      RETIRED_GENERATED_CLEANUP_DIRS.includes('claude/src'),
      'Claude detached payload must be stale-pruned'
    );

    for (const ownedDir of LIVE_OWNED_GENERATED_DIRS) {
      assert.equal(fs.existsSync(path.join(ROOT, ownedDir)), true, `${ownedDir} exists`);
    }

    for (const ownedDir of RETIRED_GENERATED_CLEANUP_DIRS) {
      assert.equal(fs.existsSync(path.join(ROOT, ownedDir)), false, `${ownedDir} remains retired`);
    }
  });
});
