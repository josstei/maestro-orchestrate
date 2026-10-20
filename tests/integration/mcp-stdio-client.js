'use strict';

const { spawn } = require('node:child_process');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const { ROOT } = require('./helpers');

const STARTUP_TIMEOUT_MS = 5000;
const ROOTS_TIMEOUT_MS = 5000;
const KILL_GRACE_MS = 250;

/**
 * Spawns the MCP server at `relativePath` (from `cwd`, the repo root by
 * default) and drives it over newline-delimited JSON-RPC on stdio. Every
 * roots/list request is answered with `client.roots`, which a test may
 * reassign; `rootsAnswered(n)` resolves once n requests have been answered.
 * `firstRequestId` (default 1) sets the id of the first request, and
 * `requestTimeoutMs` (default none) rejects a request left unanswered that
 * long.
 */
function spawnMcpServer(options) {
  const cwd = options.cwd || ROOT;
  const relativePath = options.relativePath;
  const requestTimeoutMs = options.requestTimeoutMs;
  // The server identifies its host runtime from this name unless
  // MAESTRO_RUNTIME is set; 'maestro-test' is not a host it recognizes.
  const clientInfo = options.clientInfo || { name: 'maestro-test', version: '0.0.0' };
  let roots = Array.isArray(options.roots)
    ? options.roots
    : [
        {
          uri: pathToFileURL(cwd).href,
          name: path.basename(cwd) || cwd,
        },
      ];
  const child = spawn(process.execPath, [relativePath], {
    cwd,
    env: {
      ...process.env,
      // Cleared so the runtime comes from clientInfo unless a test sets it.
      MAESTRO_RUNTIME: '',
      ...(options.env || {}),
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stdoutBuffer = '';
  let stdout = '';
  let stderr = '';
  let ready = false;
  let exited = false;
  let nextId = options.firstRequestId ?? 1;
  let rootsRequests = 0;
  const rootsWaiters = new Set();
  let settleReady;
  let rejectReady;

  const readyPromise = new Promise((resolve, reject) => {
    settleReady = resolve;
    rejectReady = reject;
  });

  const startupTimer = setTimeout(() => {
    rejectReady(
      new Error(
        `Timed out waiting for ${relativePath} to start.\nSTDERR:\n${stderr}\nSTDOUT:\n${stdout}`
      )
    );
    close();
  }, STARTUP_TIMEOUT_MS);

  const pending = new Map();

  function finishPending(error) {
    for (const { reject } of pending.values()) {
      reject(error);
    }
    pending.clear();
  }

  function send(message) {
    child.stdin.write(JSON.stringify(message) + '\n');
  }

  function sendResponse(id, result) {
    send({
      jsonrpc: '2.0',
      id,
      result,
    });
  }

  function handleMessage(message) {
    if (message && message.id != null && (message.result !== undefined || message.error !== undefined)) {
      const entry = pending.get(message.id);
      if (!entry) {
        return;
      }

      pending.delete(message.id);
      if (message.error) {
        entry.reject(new Error(JSON.stringify(message.error)));
        return;
      }

      entry.resolve(message.result);
      return;
    }

    if (message && message.method === 'roots/list' && message.id != null) {
      sendResponse(message.id, {
        roots,
      });
      rootsRequests += 1;
      for (const waiter of rootsWaiters) {
        waiter();
      }
    }
  }

  child.stdout.on('data', (chunk) => {
    const text = chunk.toString('utf8');
    stdout += text;
    stdoutBuffer += text;

    while (true) {
      const newlineIndex = stdoutBuffer.indexOf('\n');
      if (newlineIndex === -1) {
        break;
      }

      const line = stdoutBuffer.slice(0, newlineIndex).trim();
      stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);

      if (!line) {
        continue;
      }

      handleMessage(JSON.parse(line));
    }
  });

  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString('utf8');

    if (!ready && stderr.includes('[info] maestro: MCP server connected')) {
      ready = true;
      clearTimeout(startupTimer);
      settleReady();
    }
  });

  child.on('error', (error) => {
    clearTimeout(startupTimer);
    if (!ready) {
      rejectReady(error);
    }
    finishPending(error);
  });

  child.on('exit', (code, signal) => {
    exited = true;
    clearTimeout(startupTimer);
    const error = new Error(
      `${relativePath} exited (code=${code}, signal=${signal}).\nSTDERR:\n${stderr}\nSTDOUT:\n${stdout}`
    );

    if (!ready) {
      rejectReady(error);
    }

    finishPending(error);
  });

  async function sendRequest(method, params = {}) {
    const id = nextId++;
    const result = new Promise((resolve, reject) => {
      let timer;
      if (requestTimeoutMs !== undefined) {
        timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`No reply to ${method} within ${requestTimeoutMs}ms.\nSTDERR:\n${stderr}`));
        }, requestTimeoutMs);
      }
      pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
    });

    send({
      jsonrpc: '2.0',
      id,
      method,
      params,
    });

    return result;
  }

  function sendNotification(method, params = {}) {
    send({
      jsonrpc: '2.0',
      method,
      params,
    });
  }

  async function initialize() {
    const result = await sendRequest('initialize', {
      protocolVersion: '2025-03-26',
      capabilities: {
        roots: {
          listChanged: false,
        },
      },
      clientInfo,
    });

    sendNotification('notifications/initialized');
    return result;
  }

  async function listTools() {
    const result = await sendRequest('tools/list');
    return result.tools || [];
  }

  async function callTool(name, args = {}) {
    const result = await sendRequest('tools/call', {
      name,
      arguments: args,
    });
    const text = result && result.content && result.content[0] ? result.content[0].text : '{}';
    return {
      raw: result,
      parsed: JSON.parse(text),
    };
  }

  function rootsAnswered(count, timeoutMs = ROOTS_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        rootsWaiters.delete(check);
        reject(new Error(`Expected roots/list request #${count}, got ${rootsRequests}`));
      }, timeoutMs);
      function check() {
        if (rootsRequests < count) return;
        clearTimeout(timer);
        rootsWaiters.delete(check);
        resolve();
      }
      rootsWaiters.add(check);
      check();
    });
  }

  async function close() {
    clearTimeout(startupTimer);
    if (exited || child.killed) {
      return;
    }

    child.kill('SIGTERM');
    setTimeout(() => {
      if (!exited) {
        child.kill('SIGKILL');
      }
    }, KILL_GRACE_MS).unref();
  }

  return {
    close,
    initialize,
    listTools,
    callTool,
    request: sendRequest,
    notify: sendNotification,
    rootsAnswered,
    ready: readyPromise,
    get roots() {
      return roots;
    },
    set roots(value) {
      roots = value;
    },
    get stderr() {
      return stderr;
    },
  };
}

module.exports = {
  spawnMcpServer,
};
