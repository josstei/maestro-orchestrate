import { DENY_RULES, ASK_RULES } from '../core/policy-rules.js';
const TOOL_NAME = 'run_shell_command';
const ASK_PRIORITY = 850;
const DENY_PRIORITY = 950;
const DENY_PREFIX_MESSAGE = 'Maestro blocks destructive shell commands. Use safer targeted tools or handle the cleanup manually.';
const HEADER = `# Maestro extension policy pack.
#
# These rules add low-friction guardrails for autonomous and interactive runs:
# - deny obviously destructive shell commands
# - ask before shell-based file writing patterns
#
# The extension tier may only contribute deny / ask_user decisions.
`;
function escapeTomlBasicString(value) {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
function toCommandRegex(rule) {
    if (rule.matchType === 'word')
        return `.*\\b${rule.pattern}\\b.*`;
    return `.*(?:${rule.pattern}).*$`;
}
function renderRegexRule(rule, decision, priority, denyMessage) {
    const lines = [
        '[[rule]]',
        `toolName = "${TOOL_NAME}"`,
        `commandRegex = "${escapeTomlBasicString(toCommandRegex(rule))}"`,
        `decision = "${decision}"`,
        `priority = ${priority}`,
    ];
    if (denyMessage)
        lines.push(`deny_message = "${escapeTomlBasicString(denyMessage)}"`);
    return lines.join('\n');
}
function renderPrefixGroup(rules) {
    const entries = rules.map((r) => `  "${escapeTomlBasicString(r.pattern)}"`).join(',\n');
    return [
        '[[rule]]',
        `toolName = "${TOOL_NAME}"`,
        'commandPrefix = [',
        entries,
        ']',
        'decision = "deny"',
        `priority = ${DENY_PRIORITY}`,
        `deny_message = "${escapeTomlBasicString(DENY_PREFIX_MESSAGE)}"`,
    ].join('\n');
}
function renderPolicyToml({ denyRules = DENY_RULES, askRules = ASK_RULES, } = {}) {
    for (const rule of denyRules) {
        if (rule.matchType === 'word')
            throw new Error(`Unsupported deny matchType: word (${rule.pattern})`);
    }
    for (const rule of askRules) {
        if (rule.matchType === 'prefix')
            throw new Error(`Unsupported ask matchType: prefix (${rule.pattern})`);
    }
    const commandDenyRules = denyRules.filter((r) => (r.tier || 'command') === 'command');
    const commandAskRules = askRules.filter((r) => (r.tier || 'command') === 'command');
    const blocks = [];
    for (const rule of commandAskRules) {
        blocks.push(renderRegexRule(rule, 'ask_user', ASK_PRIORITY, null));
    }
    const denyPrefixes = commandDenyRules.filter((r) => r.matchType === 'prefix');
    if (denyPrefixes.length > 0)
        blocks.push(renderPrefixGroup(denyPrefixes));
    for (const rule of commandDenyRules.filter((r) => r.matchType === 'regex')) {
        blocks.push(renderRegexRule(rule, 'deny', DENY_PRIORITY, rule.reason || null));
    }
    return `${HEADER}\n${blocks.join('\n\n')}\n`;
}
function buildPolicyTomlOutputs() {
    return [{ outputPath: 'policies/maestro.toml', content: renderPolicyToml() }];
}
export { buildPolicyTomlOutputs, renderPolicyToml };
