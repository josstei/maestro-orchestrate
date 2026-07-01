'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

const { ROOT, withPackagedClaudeRuntime } = require('./helpers');

const SCRIPT_PATH = path.resolve(__dirname, '..', '..', 'claude', 'scripts', 'policy-enforcer.js');
const DOLLAR = '$';
const BACKTICK = '`';
const BACKSLASH = '\\';

function runPolicy(command, options = {}) {
  const result = spawnSync(process.execPath, [options.scriptPath || SCRIPT_PATH], {
    cwd: options.cwd || ROOT,
    input: JSON.stringify({ tool_input: { command } }),
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout.trim());
}

test('blocks destructive commands in direct and nested dollar substitutions', () => {
  assert.equal(runPolicy(`echo ${DOLLAR}(git reset --hard)`).decision, 'block');
  assert.equal(
    runPolicy(`echo ${DOLLAR}(printf %s "${DOLLAR}(git reset --hard)")`).decision,
    'block'
  );
});

test('blocks destructive commands in nested backtick substitutions', () => {
  const command =
    `echo ${BACKTICK}printf %s "${BACKSLASH}${BACKTICK}` +
    `git reset --hard${BACKSLASH}${BACKTICK}"${BACKTICK}`;

  assert.equal(runPolicy(command).decision, 'block');
});

test('approves benign nested substitutions', () => {
  assert.equal(
    runPolicy(`echo ${DOLLAR}(printf %s "${DOLLAR}(git status --short)")`).decision,
    'approve'
  );
  assert.equal(
    runPolicy(`echo ${DOLLAR}(printf %s "${DOLLAR}(pwd)" | sed "s#/tmp#/tmp#") && echo ok`).decision,
    'approve'
  );

  const backtickCommand =
    `echo ${BACKTICK}printf %s "${BACKSLASH}${BACKTICK}` +
    `pwd${BACKSLASH}${BACKTICK}"${BACKTICK}`;

  assert.equal(runPolicy(backtickCommand).decision, 'approve');
});

test('installed Claude policy enforcer loads package-root src without detached payload', async () => {
  await withPackagedClaudeRuntime(async (packageRoot) => {
    const detachedPayload = path.join(packageRoot, 'claude', 'src');
    fs.rmSync(detachedPayload, { recursive: true, force: true });
    assert.equal(fs.existsSync(detachedPayload), false);

    const scriptPath = path.join(packageRoot, 'claude', 'scripts', 'policy-enforcer.js');

    assert.equal(
      runPolicy('git reset --hard', { cwd: packageRoot, scriptPath }).decision,
      'block'
    );
    assert.equal(
      runPolicy('git status --short', { cwd: packageRoot, scriptPath }).decision,
      'approve'
    );
  });
});
