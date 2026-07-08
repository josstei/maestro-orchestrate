import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { checkPhaseFieldSchema } from '../../dist/src/mcp/validation/schema-checker.js';
import { validatePhases } from '../../dist/src/mcp/contracts/plan-schema.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const LEGACY_MODULE_NAME = ['retrieval', 'provider'].join('-');
const LEGACY_CLASS_NAME = ['Retrieval', 'Provider'].join('');

test('the collapsed retrieval seam module no longer exists on disk', () => {
  const legacyModulePath = path.join(REPO_ROOT, 'src/mcp/retrieval', `${LEGACY_MODULE_NAME}.js`);
  assert.equal(fs.existsSync(legacyModulePath), false);
});

test('no references to the collapsed retrieval seam remain in src/ or tests/', () => {
  const grep = () =>
    execFileSync('grep', ['-rl', '-e', LEGACY_MODULE_NAME, '-e', LEGACY_CLASS_NAME, 'src', 'tests'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });

  assert.throws(grep, (error) => error.status === 1);
});

test('schema-checker delegates phase field validation to validatePhases', () => {
  const phases = [{ id: 1, name: 'P', parallel: false, blocked_by: [] }];

  const delegated = validatePhases(phases);
  const checked = checkPhaseFieldSchema(phases);

  assert.equal(delegated.valid, false);
  assert.equal(checked.length, delegated.violations.length);
  assert.ok(checked.some((violation) => violation.rule === 'missing_required_field' && violation.field === 'agent'));
});

test('schema-checker.ts imports validatePhases from plan-schema.js', () => {
  const source = fs.readFileSync(
    path.join(REPO_ROOT, 'src/mcp/validation/schema-checker.ts'),
    'utf8'
  );
  assert.match(source, /import\s*\{\s*validatePhases\s*\}\s*from\s*'\.\.\/contracts\/plan-schema\.js'/);
  assert.match(source, /validatePhases\(phases\)/);
});
