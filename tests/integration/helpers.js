'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const HOOKS_DIR = path.join(PROJECT_ROOT, 'hooks');
const SCRIPTS_DIR = path.join(PROJECT_ROOT, 'scripts');
const HOOK_STATE_DIR = process.platform === 'win32'
  ? path.join(os.tmpdir(), 'maestro-hooks')
  : '/tmp/maestro-hooks';

function hookPath(hookName) {
  return path.join(HOOKS_DIR, hookName);
}

function scriptPath(scriptName) {
  return path.join(SCRIPTS_DIR, scriptName);
}

function runHook(hookFile, inputObj, envOverrides = {}) {
  const input = typeof inputObj === 'string' ? inputObj : JSON.stringify(inputObj);
  const stdout = execFileSync('node', [hookFile], {
    input,
    encoding: 'utf8',
    env: { ...process.env, ...envOverrides },
    timeout: 10000,
  });
  return stdout.trim();
}

function runHookJson(hookFile, inputObj, envOverrides = {}) {
  const raw = runHook(hookFile, inputObj, envOverrides);
  return JSON.parse(raw);
}

function runScript(scriptFile, args = [], options = {}) {
  const { env = {}, cwd, input, timeout = 10000 } = options;
  const stdout = execFileSync('node', [scriptFile, ...args], {
    input,
    encoding: 'utf8',
    cwd,
    env: { ...process.env, ...env },
    timeout,
  });
  return stdout;
}

function runScriptWithExit(scriptFile, args = [], options = {}) {
  const { env = {}, cwd, input, timeout = 10000 } = options;
  const { spawnSync } = require('child_process');
  const result = spawnSync('node', [scriptFile, ...args], {
    input,
    encoding: 'utf8',
    cwd,
    env: { ...process.env, ...env },
    timeout,
  });
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.status ?? 1,
  };
}

function createTempDir(prefix = 'maestro-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeSessionState(cwd, stateContent, stateDir = '.gemini') {
  const statePath = path.join(cwd, stateDir, 'state');
  fs.mkdirSync(statePath, { recursive: true });
  const filePath = path.join(statePath, 'active-session.md');
  fs.writeFileSync(filePath, stateContent);
  return filePath;
}

function cleanHookState(sessionId) {
  const sessionDir = path.join(HOOK_STATE_DIR, sessionId);
  fs.rmSync(sessionDir, { recursive: true, force: true });
}

function readHookStateAgent(sessionId) {
  const agentFile = path.join(HOOK_STATE_DIR, sessionId, 'active-agent');
  try {
    return fs.readFileSync(agentFile, 'utf8').trim();
  } catch {
    return '';
  }
}

function hookStateSessionExists(sessionId) {
  return fs.existsSync(path.join(HOOK_STATE_DIR, sessionId));
}

function writeHookStateAgent(sessionId, agentName) {
  const sessionDir = path.join(HOOK_STATE_DIR, sessionId);
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(path.join(sessionDir, 'active-agent'), agentName);
}

function setFakeHome(env, homePath) {
  env.HOME = homePath;
  if (process.platform === 'win32') {
    env.USERPROFILE = homePath;
  }
}

function removeTempDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
}

function createGeminiStub(binDir, scriptContent) {
  fs.mkdirSync(binDir, { recursive: true });
  const stubPath = path.join(binDir, 'gemini');
  fs.writeFileSync(stubPath, scriptContent);
  if (process.platform === 'win32') {
    const cmdPath = path.join(binDir, 'gemini.cmd');
    fs.writeFileSync(cmdPath, '@node "%~dp0gemini" %*\r\n');
  } else {
    fs.chmodSync(stubPath, 0o755);
  }
  return stubPath;
}

module.exports = {
  PROJECT_ROOT,
  HOOKS_DIR,
  SCRIPTS_DIR,
  HOOK_STATE_DIR,
  hookPath,
  scriptPath,
  runHook,
  runHookJson,
  runScript,
  runScriptWithExit,
  createTempDir,
  writeSessionState,
  cleanHookState,
  readHookStateAgent,
  hookStateSessionExists,
  writeHookStateAgent,
  removeTempDir,
  createGeminiStub,
  setFakeHome,
};
