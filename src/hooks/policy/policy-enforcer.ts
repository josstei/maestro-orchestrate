import fs from 'node:fs';
import path from 'node:path';
import { DENY_RULES, ASK_RULES } from '../../core/policy-rules.js';
const WRAPPERS = new Set(['env', 'sudo', 'doas', 'nice', 'nohup', 'time', 'command', 'builtin', 'exec', 'ionice', 'stdbuf', 'setsid']);

const VALUE_FLAGS: Record<string, Set<string>> = {
  sudo: new Set(['-u', '-g', '-U', '-C', '-D', '-p', '-h', '-R', '--user', '--group']),
  nice: new Set(['-n', '--adjustment']),
  ionice: new Set(['-c', '-n', '-p']),
  stdbuf: new Set(['-i', '-o', '-e']),
  env: new Set(['-C', '-S', '-u']),
};

function basename(token: any) {
  const i = token.lastIndexOf('/');
  return i === -1 ? token : token.slice(i + 1);
}

function normalizeSegment(segment: any) {
  let toks = segment.trim().replace(/^\\(?=\S)/, '').split(/\s+/).filter(Boolean);
  let progressed = true;
  while (progressed && toks.length > 1) {
    progressed = false;
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(toks[0])) { toks = toks.slice(1); progressed = true; continue; }
    const head = basename(toks[0]);
    if (WRAPPERS.has(head)) {
      const vf = VALUE_FLAGS[head] || new Set();
      toks = toks.slice(1);
      while (toks.length > 1 && toks[0].startsWith('-')) {
        const flag = toks[0]; toks = toks.slice(1);
        if (vf.has(flag) && toks.length > 1 && !toks[0].startsWith('-')) toks = toks.slice(1);
      }
      while (toks.length > 1 && /^[A-Za-z_][A-Za-z0-9_]*=/.test(toks[0])) toks = toks.slice(1);
      progressed = true; continue;
    }
  }
  if (toks.length) toks[0] = basename(toks[0]);
  return toks.join(' ');
}

function safeRealpath(p: any) {
  let abs = path.resolve(p);
  const tail = [];
  for (;;) {
    try { const real = fs.realpathSync(abs); return tail.length ? path.join(real, ...tail) : real; }
    catch (e: any) {
      if (e.code !== 'ENOENT') return abs; // unknown error: use resolved path
      const parent = path.dirname(abs);
      if (parent === abs) return path.join(abs, ...tail);
      tail.unshift(path.basename(abs));
      abs = parent;
    }
  }
}

function isWriteAllowed(filePath: any, root: any, allow: any) {
  if (!root || !filePath) return false;
  const target = safeRealpath(filePath);
  const bases = [safeRealpath(root), ...(allow || []).filter(Boolean).map(safeRealpath)];
  return bases.some((b: any) => target === b || target.startsWith(b + path.sep));
}

function resolveWorkspaceRoot(input: any) {
  const root = process.env.MAESTRO_WORKSPACE_PATH || (input && input.cwd) || process.cwd();
  return root ? path.resolve(root) : null;
}

const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit']);

function splitCommands(command: any) {
  const parts = [];
  let depth = 0;
  let current = '';
  let inSingle = false;
  let inDouble = false;
  let escaped = false;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];

    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\' && !inSingle) {
      current += ch;
      escaped = true;
      continue;
    }
    if (ch === "'" && !inDouble) { inSingle = !inSingle; current += ch; continue; }
    if (ch === '"' && !inSingle) { inDouble = !inDouble; current += ch; continue; }

    if (!inSingle && ch === '$' && command[i + 1] === '(') {
      const parsed = readDollarSubshell(command, i + 2);
      current += '$(' + parsed.content + ')';
      i = parsed.end;
      continue;
    }
    if (!inSingle && ch === '`') {
      const parsed = readBacktickSubshell(command, i + 1);
      current += '`' + parsed.content + '`';
      i = parsed.end;
      continue;
    }

    if (inSingle || inDouble) {
      current += ch;
      continue;
    }

    if (ch === '(' || ch === '{') { depth++; current += ch; continue; }
    if (ch === ')') {
      if (depth > 0) {
        depth--;
      }
      current += ch;
      continue;
    }
    if (ch === '}') { depth--; current += ch; continue; }

    if (depth === 0) {
      if (ch === ';') {
        parts.push(current);
        current = '';
        continue;
      }
      if (ch === '&' && command[i + 1] === '&') {
        parts.push(current);
        current = '';
        i++;
        continue;
      }
      if (ch === '|' && command[i + 1] === '|') {
        parts.push(current);
        current = '';
        i++;
        continue;
      }
      if (ch === '|') {
        parts.push(current);
        current = '';
        continue;
      }
    }
    current += ch;
  }
  if (current) parts.push(current);
  return parts.map((p: any) => p.trim()).filter(Boolean);
}

function readBacktickSubshell(command: any, startIndex: any) {
  let content = '';

  for (let i = startIndex; i < command.length; i++) {
    const ch = command[i];
    if (ch === '\\') {
      const next = command[i + 1];
      if (next === '`') {
        content += '`';
        i++;
        continue;
      }
      content += ch;
      continue;
    }
    if (ch === '`') {
      return { content, end: i };
    }
    content += ch;
  }

  throw new Error('Unterminated backtick command substitution');
}

function readDollarSubshell(command: any, startIndex: any) {
  let content = '';
  let inSingle = false;
  let inDouble = false;
  let escaped = false;

  for (let i = startIndex; i < command.length; i++) {
    const ch = command[i];

    if (escaped) {
      content += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\' && !inSingle) {
      if (command[i + 1] === '`') {
        content += '`';
        i++;
        continue;
      }
      content += ch;
      escaped = true;
      continue;
    }
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      content += ch;
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      content += ch;
      continue;
    }
    if (inSingle) {
      content += ch;
      continue;
    }
    if (ch === '$' && command[i + 1] === '(') {
      const parsed = readDollarSubshell(command, i + 2);
      content += '$(' + parsed.content + ')';
      i = parsed.end;
      continue;
    }
    if (ch === '`') {
      const parsed = readBacktickSubshell(command, i + 1);
      content += '`' + parsed.content + '`';
      i = parsed.end;
      continue;
    }
    if (!inSingle && ch === ')') {
      return { content, end: i };
    }

    content += ch;
  }

  throw new Error('Unterminated $(...) command substitution');
}

function extractSubshells(command: any): string[] {
  const patterns: string[] = [];
  let inSingle = false;
  let inDouble = false;
  let escaped = false;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\' && !inSingle) {
      escaped = true;
      continue;
    }
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (inSingle) continue;

    if (ch === '$' && command[i + 1] === '(') {
      const parsed = readDollarSubshell(command, i + 2);
      const content = parsed.content.trim();
      if (content) {
        patterns.push(content, ...extractSubshells(content));
      }
      i = parsed.end;
      continue;
    }

    if (ch === '`') {
      const parsed = readBacktickSubshell(command, i + 1);
      const content = parsed.content.trim();
      if (content) {
        patterns.push(content, ...extractSubshells(content));
      }
      i = parsed.end;
    }
  }

  return patterns;
}

function checkCommand(command: any) {
  const segments = splitCommands(command);
  const subshells = extractSubshells(command);
  const base = [...new Set([...segments, ...subshells, ...subshells.flatMap((s: any) => splitCommands(s))])];
  const allParts = [...new Set([...base, ...base.map(normalizeSegment)])];

  for (const part of allParts) {
    for (const rule of DENY_RULES) {
      if (matchRule(rule, part)) return { decision: 'block', reason: rule.reason };
    }
  }
  for (const part of allParts) {
    for (const rule of ASK_RULES) {
      if (matchRule(rule, part)) return { decision: 'ask', reason: rule.reason };
    }
  }
  return { decision: 'approve' };
}

function matchRule(rule: any, command: any) {
  const trimmed = command.trimStart();
  switch (rule.matchType) {
    case 'prefix':
      return trimmed.startsWith(rule.pattern);
    case 'regex':
      return new RegExp(rule.pattern).test(trimmed);
    case 'word':
      return new RegExp('\\b' + rule.pattern + '\\b').test(trimmed);
    default:
      return false;
  }
}

const PERMISSION_DECISION: Record<string, string> = { approve: 'allow', ask: 'ask', block: 'deny' };

function toHookOutput(result: any) {
  const hookSpecificOutput: Record<string, any> = {
    hookEventName: 'PreToolUse',
    permissionDecision: PERMISSION_DECISION[result.decision],
  };
  if (result.reason) {
    hookSpecificOutput.permissionDecisionReason = result.reason;
  }
  return { hookSpecificOutput };
}

const MAX_STDIN_BYTES = 1024 * 1024;

function main() {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  process.stdin.on('data', (chunk: any) => {
    totalBytes += chunk.length;
    if (totalBytes > MAX_STDIN_BYTES) {
      process.stderr.write('Policy enforcer: stdin payload too large\n');
      process.stdout.write(JSON.stringify(toHookOutput({ decision: 'block', reason: 'Payload too large' })) + '\n');
      process.exit(1);
    }
    chunks.push(chunk);
  });
  process.stdin.on('end', () => {
    try {
      const input = JSON.parse(Buffer.concat(chunks).toString());
      const toolName = input.tool_name || '';
      let result;
      if (WRITE_TOOLS.has(toolName)) {
        const fp = (input.tool_input && input.tool_input.file_path) || '';
        const root = resolveWorkspaceRoot(input);
        const allow = [process.env.MAESTRO_STATE_DIR, ...String(process.env.MAESTRO_WRITE_ALLOW || '').split(path.delimiter)].filter(Boolean);
        result = isWriteAllowed(fp, root, allow)
          ? { decision: 'approve' }
          : { decision: 'block', reason: `Write outside workspace boundary: ${fp || '(no path)'}` };
      } else {
        const command = (input.tool_input && input.tool_input.command) || '';
        result = checkCommand(command);
      }
      process.stdout.write(JSON.stringify(toHookOutput(result)) + '\n');
    } catch (err: any) {
      process.stderr.write('Policy enforcer error: ' + err.message + '\n');
      process.stdout.write(JSON.stringify(toHookOutput({ decision: 'block', reason: 'Policy enforcer internal error' })) + '\n');
    }
  });
}

export { main, splitCommands, readBacktickSubshell, readDollarSubshell, extractSubshells, checkCommand, normalizeSegment, isWriteAllowed, resolveWorkspaceRoot, safeRealpath, matchRule, toHookOutput, PERMISSION_DECISION, MAX_STDIN_BYTES };
