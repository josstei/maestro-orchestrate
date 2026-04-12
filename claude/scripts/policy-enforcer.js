'use strict';

/**
 * Maestro policy enforcer for Claude Code.
 * Reads stdin (Claude Code PreToolUse hook input for Bash),
 * checks tool_input.command against deny and ask patterns,
 * and outputs a decision JSON to stdout.
 *
 * Rules are loaded from the canonical source (src/core/policy-rules.js)
 * with a fallback to the bundled copy for detached installs.
 */

const fs = require('node:fs');
const path = require('node:path');

const repoRules = path.resolve(__dirname, '../../src/core/policy-rules.js');
const bundledRules = path.resolve(__dirname, '../src/core/policy-rules.js');
const { DENY_RULES, ASK_RULES } = require(fs.existsSync(repoRules) ? repoRules : bundledRules);

function splitCommands(command) {
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
  return parts.map((p) => p.trim()).filter(Boolean);
}

function readBacktickSubshell(command, startIndex) {
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

function readDollarSubshell(command, startIndex) {
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

function extractSubshells(command) {
  const patterns = [];
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

function checkCommand(command) {
  const segments = splitCommands(command);
  const subshells = extractSubshells(command);
  const allParts = [...new Set([...segments, ...subshells, ...subshells.flatMap((s) => splitCommands(s))])];

  for (const part of allParts) {
    for (const rule of DENY_RULES) {
      if (matchRule(rule, part)) {
        return { decision: 'block', reason: rule.reason };
      }
    }
  }
  for (const part of allParts) {
    for (const rule of ASK_RULES) {
      if (matchRule(rule, part)) {
        return { decision: 'ask', reason: rule.reason };
      }
    }
  }
  return { decision: 'approve' };
}

function matchRule(rule, command) {
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

const MAX_STDIN_BYTES = 1024 * 1024;
const chunks = [];
let totalBytes = 0;
process.stdin.on('data', (chunk) => {
  totalBytes += chunk.length;
  if (totalBytes > MAX_STDIN_BYTES) {
    process.stderr.write('Policy enforcer: stdin payload too large\n');
    process.stdout.write(JSON.stringify({ decision: 'block', reason: 'Payload too large' }) + '\n');
    process.exit(1);
  }
  chunks.push(chunk);
});
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(Buffer.concat(chunks).toString());
    const command = (input.tool_input && input.tool_input.command) || '';
    const result = checkCommand(command);
    process.stdout.write(JSON.stringify(result) + '\n');
  } catch (err) {
    process.stderr.write('Policy enforcer error: ' + err.message + '\n');
    process.stdout.write(JSON.stringify({ decision: 'block', reason: 'Policy enforcer internal error' }) + '\n');
  }
});
