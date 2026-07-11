import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  EXPECTED_PACKAGE_SCRIPT_LIFECYCLE,
  packageJson,
} from '../support/contracts.js';

const BUILD_FREE_SCRIPTS = Object.freeze([
  'generate:run',
  'test:run',
  'release:artifacts:run',
  'release:verify-artifacts:run',
  'pack:verify:run',
]);

const BUILD_OWNERS = Object.freeze([
  'generate',
  'test',
  'check:source',
  'release:artifacts',
  'release:verify-artifacts',
  'pack:verify',
  'check:release',
  'prepack',
]);

function scriptDependencies(script) {
  return [...script.matchAll(/\bnpm run ([a-z0-9:-]+)/g)]
    .map((match) => match[1]);
}

function reachableBuildCount(name, visiting = new Set()) {
  if (name === 'build') {
    return 1;
  }
  if (visiting.has(name)) {
    throw new Error(`Package script cycle detected at ${name}`);
  }

  const script = packageJson.scripts[name];
  assert.equal(typeof script, 'string', `missing package script: ${name}`);
  const next = new Set(visiting).add(name);
  return scriptDependencies(script)
    .reduce((count, dependency) => count + reachableBuildCount(dependency, next), 0);
}

describe('package script lifecycle', () => {
  it('matches the independent lifecycle contract', () => {
    for (const [name, expected] of Object.entries(EXPECTED_PACKAGE_SCRIPT_LIFECYCLE)) {
      assert.equal(packageJson.scripts[name], expected, name);
    }
  });

  it('keeps leaves build-free and public lifecycle boundaries build-owning', () => {
    for (const name of BUILD_FREE_SCRIPTS) {
      assert.equal(reachableBuildCount(name), 0, name);
    }
    for (const name of BUILD_OWNERS) {
      assert.equal(reachableBuildCount(name), 1, name);
    }
  });

  it('uses build-free leaves inside composite gates', () => {
    assert.match(packageJson.scripts['check:source'], /npm run generate:run/);
    assert.match(packageJson.scripts['check:source'], /npm run test:run/);
    assert.doesNotMatch(packageJson.scripts['check:source'], /npm run (?:generate|test)(?:\s|$)/);

    assert.match(packageJson.scripts['check:release'], /npm run pack:verify:run/);
    assert.match(packageJson.scripts['check:release'], /npm run release:artifacts:run/);
    assert.match(packageJson.scripts['check:release'], /npm run release:verify-artifacts:run/);
  });

  it('keeps standalone pack verification scripts-enabled', () => {
    assert.doesNotMatch(packageJson.scripts['pack:verify'], /--ignore-scripts/);
    assert.doesNotMatch(packageJson.scripts['pack:verify:run'], /--ignore-scripts/);
    assert.match(packageJson.scripts['check:release'], /pack:verify:run -- --ignore-scripts/);
    assert.equal(packageJson.scripts.prepack, 'npm run generate');
  });
});
