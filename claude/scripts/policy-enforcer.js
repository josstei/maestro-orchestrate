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

function checkCommand(command) {
  for (const rule of DENY_RULES) {
    if (matchRule(rule, command)) {
      return { decision: 'block', reason: rule.reason };
    }
  }
  for (const rule of ASK_RULES) {
    if (matchRule(rule, command)) {
      return { decision: 'ask', reason: rule.reason };
    }
  }
  return { decision: 'approve' };
}

function matchRule(rule, command) {
  switch (rule.matchType) {
    case 'prefix':
      return command.startsWith(rule.pattern);
    case 'regex':
      return new RegExp(rule.pattern).test(command);
    case 'word':
      return new RegExp('\\b' + rule.pattern + '\\b').test(command);
    default:
      return false;
  }
}

const chunks = [];
process.stdin.on('data', (chunk) => chunks.push(chunk));
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(Buffer.concat(chunks).toString());
    const command = (input.tool_input && input.tool_input.command) || '';
    const result = checkCommand(command);
    process.stdout.write(JSON.stringify(result) + '\n');
  } catch (err) {
    process.stderr.write('Policy enforcer error: ' + err.message + '\n');
    process.stdout.write(JSON.stringify({ decision: 'approve' }) + '\n');
  }
});
