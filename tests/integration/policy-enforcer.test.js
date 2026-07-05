import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { ROOT, withPackagedClaudeRuntime } from './helpers.js';
import { fileURLToPath } from 'node:url';
const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirname = path.dirname(moduleFilename);
const SCRIPT_PATH = path.resolve(moduleDirname, '..', '..', 'claude', 'scripts', 'policy-enforcer.js');
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
  assert.equal(runPolicy(`echo ${DOLLAR}(git reset --hard)`).hookSpecificOutput.permissionDecision, 'deny');
  assert.equal(
    runPolicy(`echo ${DOLLAR}(printf %s "${DOLLAR}(git reset --hard)")`).hookSpecificOutput.permissionDecision,
    'deny'
  );
});

test('blocks destructive commands in nested backtick substitutions', () => {
  const command =
    `echo ${BACKTICK}printf %s "${BACKSLASH}${BACKTICK}` +
    `git reset --hard${BACKSLASH}${BACKTICK}"${BACKTICK}`;

  assert.equal(runPolicy(command).hookSpecificOutput.permissionDecision, 'deny');
});

test('approves benign nested substitutions', () => {
  assert.equal(
    runPolicy(`echo ${DOLLAR}(printf %s "${DOLLAR}(git status --short)")`).hookSpecificOutput.permissionDecision,
    'allow'
  );
  assert.equal(
    runPolicy(`echo ${DOLLAR}(printf %s "${DOLLAR}(pwd)" | sed "s#/tmp#/tmp#") && echo ok`).hookSpecificOutput.permissionDecision,
    'allow'
  );

  const backtickCommand =
    `echo ${BACKTICK}printf %s "${BACKSLASH}${BACKTICK}` +
    `pwd${BACKSLASH}${BACKTICK}"${BACKTICK}`;

  assert.equal(runPolicy(backtickCommand).hookSpecificOutput.permissionDecision, 'allow');
});

test('ask-tier commands emit schema-valid hookSpecificOutput (regression: ask no longer fails open)', () => {
  const out = runPolicy('echo hi > out.txt');
  assert.equal(out.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(out.hookSpecificOutput.permissionDecision, 'ask');
  assert.equal(out.hookSpecificOutput.permissionDecisionReason, 'Shell output redirection');
  assert.equal(out.decision, undefined);
});

test('installed Claude policy enforcer loads package-root src without detached payload', async () => {
  await withPackagedClaudeRuntime(async (packageRoot) => {
    const detachedPayload = path.join(packageRoot, 'claude', 'src');
    fs.rmSync(detachedPayload, { recursive: true, force: true });
    assert.equal(fs.existsSync(detachedPayload), false);

    const scriptPath = path.join(packageRoot, 'claude', 'scripts', 'policy-enforcer.js');

    assert.equal(
      runPolicy('git reset --hard', { cwd: packageRoot, scriptPath }).hookSpecificOutput.permissionDecision,
      'deny'
    );
    assert.equal(
      runPolicy('git status --short', { cwd: packageRoot, scriptPath }).hookSpecificOutput.permissionDecision,
      'allow'
    );
  });
});
