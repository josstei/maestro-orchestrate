import { checkCommand, matchRule } from './policy-evaluator.js';
import {
  extractSubshells,
  normalizeSegment,
  readBacktickSubshell,
  readDollarSubshell,
  splitCommands,
} from './shell-parser.js';
import {
  WRITE_TOOLS,
  checkWriteToolInput,
  isWriteAllowed,
  resolveWorkspaceRoot,
  safeRealpath,
} from './write-jail.js';

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
      const result = WRITE_TOOLS.has(toolName)
        ? checkWriteToolInput(input)
        : checkCommand((input.tool_input && input.tool_input.command) || '');
      process.stdout.write(JSON.stringify(toHookOutput(result)) + '\n');
    } catch (err: any) {
      process.stderr.write('Policy enforcer error: ' + err.message + '\n');
      process.stdout.write(JSON.stringify(toHookOutput({ decision: 'block', reason: 'Policy enforcer internal error' })) + '\n');
    }
  });
}

export {
  MAX_STDIN_BYTES,
  PERMISSION_DECISION,
  checkCommand,
  extractSubshells,
  isWriteAllowed,
  main,
  matchRule,
  normalizeSegment,
  readBacktickSubshell,
  readDollarSubshell,
  resolveWorkspaceRoot,
  safeRealpath,
  splitCommands,
  toHookOutput,
};
