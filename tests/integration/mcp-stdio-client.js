import { spawn } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from './helpers.js';

const STARTUP_TIMEOUT_MS = 30000;
const SIGTERM_GRACE_MS = 1000;
const SIGKILL_GRACE_MS = 1000;

function spawnMcpServer(options) {
  const cwd = options.cwd || ROOT;
  const relativePath = options.relativePath;
  const roots = Array.isArray(options.roots)
    ? options.roots.map((root) => {
        if (typeof root === 'string') {
          return {
            uri: pathToFileURL(root).href,
            name: path.basename(root) || root,
          };
        }

        return root;
      })
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
      ...(options.env || {}),
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stdoutBuffer = '';
  let stderr = '';
  let ready = false;
  let exited = false;
  let nextId = 1;
  let settleReady;
  let rejectReady;
  let settleExit;
  let closePromise;

  const readyPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(
        new Error(
          `Timed out waiting for ${relativePath} to start.\nSTDERR:\n${stderr}\nSTDOUT:\n${stdout}`
        )
      );
    }, STARTUP_TIMEOUT_MS);

    settleReady = () => {
      clearTimeout(timeout);
      resolve();
    };
    rejectReady = (error) => {
      clearTimeout(timeout);
      reject(error);
    };
  });
  const exitPromise = new Promise((resolve) => {
    settleExit = resolve;
  });

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
      settleReady();
    }

    if (stderr.includes('[error] maestro: MCP server failed:')) {
      const error = new Error(stderr.trim());
      if (!ready) {
        rejectReady(error);
      }
      finishPending(error);
    }
  });

  child.on('error', (error) => {
    if (child.pid == null && !exited) {
      exited = true;
      settleExit({ code: null, signal: null });
    }
    if (!ready) {
      rejectReady(error);
    }
    finishPending(error);
  });

  child.on('exit', (code, signal) => {
    exited = true;
    settleExit({ code, signal });
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
      pending.set(id, { resolve, reject });
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
      clientInfo: {
        name: 'maestro-test',
        version: '0.0.0',
      },
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
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
    return {
      raw: result,
      parsed,
    };
  }

  function waitForExit(timeoutMs) {
    if (exited) {
      return Promise.resolve(true);
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(false), timeoutMs);
      exitPromise.then(() => {
        clearTimeout(timeout);
        resolve(true);
      });
    });
  }

  async function terminate() {
    if (exited) return;

    child.kill('SIGTERM');
    if (await waitForExit(SIGTERM_GRACE_MS)) return;

    child.kill('SIGKILL');
    if (await waitForExit(SIGKILL_GRACE_MS)) return;

    throw new Error(
      `Failed to stop ${relativePath} after SIGTERM and SIGKILL.\nSTDERR:\n${stderr}\nSTDOUT:\n${stdout}`
    );
  }

  function close() {
    closePromise ||= terminate();
    return closePromise;
  }

  return {
    child,
    close,
    initialize,
    listTools,
    callTool,
    getStderr: () => stderr,
    ready: readyPromise,
    sendNotification,
    sendRequest,
  };
}

async function withMcpServer(options, fn, { initialize = true } = {}) {
  const client = spawnMcpServer(options);

  try {
    await client.ready;
    if (initialize) {
      await client.initialize();
    }
    return await fn(client);
  } finally {
    await client.close();
  }
}

export { spawnMcpServer, withMcpServer };
