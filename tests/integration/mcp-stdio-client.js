'use strict';

const { spawn } = require('node:child_process');
const { EventEmitter, once } = require('node:events');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const { ROOT } = require('../support/paths');

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
class McpStdioClient extends EventEmitter {
  constructor({
    cwd = ROOT,
    relativePath,
    env,
    roots,
    firstRequestId = 1,
    requestTimeoutMs,
    // The server identifies its host runtime from this name unless
    // MAESTRO_RUNTIME is set; 'maestro-test' is not a host it recognizes.
    clientInfo = { name: 'maestro-test', version: '0.0.0' },
  }) {
    super();
    this.requestTimeoutMs = requestTimeoutMs;
    this.clientInfo = clientInfo;
    this.roots = roots || [{ uri: pathToFileURL(cwd).href, name: path.basename(cwd) || cwd }];
    this.nextId = firstRequestId;
    this.pending = new Map();
    this.rootsRequests = 0;
    this.stdoutBuffer = '';
    this.stdout = '';
    this.stderr = '';
    this.exited = false;
    this.child = spawn(process.execPath, [relativePath], {
      cwd,
      // Cleared so the runtime comes from clientInfo unless a test sets it.
      env: { ...process.env, MAESTRO_RUNTIME: '', ...env },
    });

    // Only complete lines are parsed; a partial line left at exit still shows in output().
    this.child.stdout.setEncoding('utf8').on('data', (chunk) => {
      this.stdout += chunk;
      const lines = (this.stdoutBuffer + chunk).split('\n');
      this.stdoutBuffer = lines.pop();
      for (const line of lines) if (line.trim()) this.handleMessage(JSON.parse(line));
    });
    this.child.stderr.setEncoding('utf8').on('data', (chunk) => {
      this.stderr += chunk;
      if (this.stderr.includes('[info] maestro: MCP server connected')) this.emit('connected');
    });
    this.child.on('error', (error) => this.fail(error));
    this.child.on('exit', (code, signal) => {
      this.exited = true;
      this.fail(new Error(`${relativePath} exited (code=${code}, signal=${signal}).${this.output()}`));
    });

    const startupTimer = setTimeout(() => {
      this.fail(new Error(`Timed out waiting for ${relativePath} to start.${this.output()}`));
      this.close();
    }, STARTUP_TIMEOUT_MS);
    this.ready = new Promise((resolve, reject) => this.once('connected', resolve).once('failed', reject))
      .finally(() => clearTimeout(startupTimer));
  }

  output() {
    return `\nSTDERR:\n${this.stderr}\nSTDOUT:\n${this.stdout}`;
  }

  fail(error) {
    this.emit('failed', error);
    for (const { reject } of this.pending.values()) reject(error);
    this.pending.clear();
  }

  handleMessage(message) {
    if (message?.id != null && (message.result !== undefined || message.error !== undefined)) {
      const entry = this.pending.get(message.id);
      if (!entry) return;
      this.pending.delete(message.id);
      if (message.error) entry.reject(new Error(JSON.stringify(message.error)));
      else entry.resolve(message.result);
    } else if (message?.method === 'roots/list' && message.id != null) {
      this.send({ id: message.id, result: { roots: this.roots } });
      this.rootsRequests += 1;
      this.emit('roots');
    }
  }

  send(message) {
    this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n');
  }

  async request(method, params = {}) {
    const id = this.nextId++;
    let timer;
    const result = new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      if (this.requestTimeoutMs === undefined) return;
      timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`No reply to ${method} within ${this.requestTimeoutMs}ms.\nSTDERR:\n${this.stderr}`));
      }, this.requestTimeoutMs);
    }).finally(() => clearTimeout(timer));
    this.send({ id, method, params });
    return result;
  }

  notify(method, params = {}) {
    this.send({ method, params });
  }

  async initialize() {
    const result = await this.request('initialize', {
      protocolVersion: '2025-03-26',
      capabilities: { roots: { listChanged: false } },
      clientInfo: this.clientInfo,
    });
    this.notify('notifications/initialized');
    return result;
  }

  async listTools() {
    const result = await this.request('tools/list');
    return result.tools || [];
  }

  async callTool(name, args = {}) {
    const result = await this.request('tools/call', { name, arguments: args });
    const text = result?.content?.[0] ? result.content[0].text : '{}';
    return { raw: result, parsed: JSON.parse(text) };
  }

  async rootsAnswered(count) {
    // Not AbortSignal.timeout: its unref'd timer lets the loop drain before a miss is reported.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ROOTS_TIMEOUT_MS);
    try {
      while (this.rootsRequests < count) await once(this, 'roots', { signal: controller.signal });
    } catch {
      throw new Error(`Expected roots/list request #${count}, got ${this.rootsRequests}`);
    } finally {
      clearTimeout(timer);
    }
  }

  close() {
    if (this.exited || this.child.killed) return;
    this.child.kill('SIGTERM');
    setTimeout(() => {
      if (!this.exited) this.child.kill('SIGKILL');
    }, KILL_GRACE_MS).unref();
  }
}

/**
 * Runs `fn` against an McpStdioClient(options) once it is ready and, unless
 * `initialize` is false, initialized. The server is closed afterwards, even
 * when `fn` throws or rejects.
 */
async function withMcpClient(options, fn, { initialize = true } = {}) {
  const client = new McpStdioClient(options);
  try {
    await client.ready;
    if (initialize) await client.initialize();
    return await fn(client);
  } finally {
    client.close();
  }
}

module.exports = {
  withMcpClient,
};
