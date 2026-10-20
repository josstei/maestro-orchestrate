'use strict';

/**
 * Renders the Qwen Code shell policy pack (policies/maestro.toml) from the
 * canonical rules in src/core/policy-rules.js. Called by the qwen builder in
 * src/platforms/metadata.js, which scripts/generate.js runs.
 */

const { DENY_RULES, ASK_RULES } = require('../../core/policy-rules');

const POLICY_PACK_HEADER = [
  '# Maestro extension policy pack.',
  '#',
  '# These rules add low-friction guardrails for autonomous and interactive runs:',
  '# - deny obviously destructive shell commands',
  '# - ask before shell-based file writing patterns',
  '#',
  '# The extension tier may only contribute deny / ask_user decisions.',
  '',
].join('\n');

const DESTRUCTIVE_DENY_MESSAGE =
  'Maestro blocks destructive shell commands. Use safer targeted tools or handle the cleanup manually.';

function policyCommandRegex(rule) {
  switch (rule.matchType) {
    case 'word':
      return `.*\\b${rule.pattern}\\b.*`;
    case 'regex':
      return `.*(?:${rule.pattern}).*$`;
    default:
      throw new Error(`Cannot render a ${rule.matchType} policy rule as a commandRegex: ${rule.pattern}`);
  }
}

// JSON string escapes are valid TOML basic-string escapes, so values are quoted with JSON.stringify.
function policyRule(lines) {
  return ['', '[[rule]]', 'toolName = "run_shell_command"', ...lines, ''].join('\n');
}

/**
 * Render the Qwen Code policy pack from the canonical rules that
 * the Claude policy enforcer applies: ask rules first, then one deny block for
 * every prefix rule, then one deny block per remaining deny rule.
 * @throws {Error} When a rule cannot be expressed as a policy commandRegex
 */
function buildPolicyPackToml(denyRules = DENY_RULES, askRules = ASK_RULES) {
  const prefixRules = denyRules.filter((rule) => rule.matchType === 'prefix');
  const regexDenyRules = denyRules.filter((rule) => rule.matchType !== 'prefix');

  return [
    POLICY_PACK_HEADER,
    ...askRules.map((rule) => policyRule([
      `commandRegex = ${JSON.stringify(policyCommandRegex(rule))}`,
      'decision = "ask_user"',
      'priority = 850',
    ])),
    policyRule([
      'commandPrefix = [',
      prefixRules.map((rule) => `  ${JSON.stringify(rule.pattern)}`).join(',\n'),
      ']',
      'decision = "deny"',
      'priority = 950',
      `deny_message = ${JSON.stringify(DESTRUCTIVE_DENY_MESSAGE)}`,
    ]),
    ...regexDenyRules.map((rule) => policyRule([
      `commandRegex = ${JSON.stringify(policyCommandRegex(rule))}`,
      'decision = "deny"',
      'priority = 950',
      `deny_message = ${JSON.stringify(rule.reason)}`,
    ])),
  ].join('');
}

module.exports = { buildPolicyPackToml };
