import { getCommandPolicy } from './policy-provider.js';
import { extractSubshells, normalizeSegment, splitCommands } from './shell-parser.js';

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

function checkCommand(command: any) {
  const { denyRules, askRules } = getCommandPolicy();
  const segments = splitCommands(command);
  const subshells = extractSubshells(command);
  const base = [...new Set([...segments, ...subshells, ...subshells.flatMap((s: any) => splitCommands(s))])];
  const allParts = [...new Set([...base, ...base.map(normalizeSegment)])];

  for (const part of allParts) {
    for (const rule of denyRules) {
      if (matchRule(rule, part)) return { decision: 'block', reason: rule.reason };
    }
  }
  for (const part of allParts) {
    for (const rule of askRules) {
      if (matchRule(rule, part)) return { decision: 'ask', reason: rule.reason };
    }
  }
  return { decision: 'approve' };
}

export { checkCommand, matchRule };
