'use strict';

/**
 * Maestro policy enforcer for Claude Code.
 * Reads stdin (Claude Code PreToolUse hook input for Bash),
 * checks tool_input.command against deny and ask patterns,
 * and outputs a decision JSON to stdout.
 */

const DENY_RULES = [
  {
    "matchType": "prefix",
    "pattern": "rm -rf",
    "reason": "Recursive force delete"
  },
  {
    "matchType": "prefix",
    "pattern": "rm -fr",
    "reason": "Recursive force delete (flag reorder)"
  },
  {
    "matchType": "prefix",
    "pattern": "sudo rm -rf",
    "reason": "Privileged recursive force delete"
  },
  {
    "matchType": "prefix",
    "pattern": "sudo rm -fr",
    "reason": "Privileged recursive force delete (flag reorder)"
  },
  {
    "matchType": "prefix",
    "pattern": "git reset --hard",
    "reason": "Discards uncommitted changes"
  },
  {
    "matchType": "prefix",
    "pattern": "git checkout --",
    "reason": "Discards uncommitted file changes"
  },
  {
    "matchType": "prefix",
    "pattern": "git clean -fd",
    "reason": "Removes untracked files permanently"
  },
  {
    "matchType": "prefix",
    "pattern": "git clean -df",
    "reason": "Removes untracked files permanently (flag reorder)"
  },
  {
    "matchType": "prefix",
    "pattern": "git clean -xfd",
    "reason": "Removes untracked and ignored files permanently"
  },
  {
    "matchType": "prefix",
    "pattern": "git clean -xdf",
    "reason": "Removes untracked and ignored files permanently (flag reorder)"
  },
  {
    "matchType": "regex",
    "pattern": "<<",
    "reason": "Heredoc corrupts structured content (YAML, Markdown, JSON) — use Write instead"
  }
];

const ASK_RULES = [
  {
    "matchType": "word",
    "pattern": "tee",
    "reason": "Writes to file and stdout"
  },
  {
    "matchType": "regex",
    "pattern": "\\s>>?\\s|\\s>>?$|^>>?\\s|\\d>>?\\s",
    "reason": "Shell output redirection"
  }
];

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
    if (ch === '\\') {
      current += ch;
      escaped = true;
      continue;
    }
    if (ch === "'" && !inDouble) { inSingle = !inSingle; current += ch; continue; }
    if (ch === '"' && !inSingle) { inDouble = !inDouble; current += ch; continue; }

    if (inSingle || inDouble) {
      current += ch;
      continue;
    }

    if (ch === '(' || ch === '{') { depth++; current += ch; continue; }
    if (ch === ')' || ch === '}') { depth--; current += ch; continue; }

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

function extractSubshells(command) {
  const patterns = [];
  const subshellRe = /\$\(([^)]+)\)/g;
  const backtickRe = /`([^`]+)`/g;
  let match;
  while ((match = subshellRe.exec(command)) !== null) {
    patterns.push(match[1].trim());
  }
  while ((match = backtickRe.exec(command)) !== null) {
    patterns.push(match[1].trim());
  }
  return patterns;
}

function checkCommand(command) {
  const segments = splitCommands(command);
  const subshells = extractSubshells(command);
  const subshellSegments = subshells.flatMap((s) => splitCommands(s));
  const allParts = [...segments, ...subshells, ...subshellSegments];

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
