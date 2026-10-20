'use strict';

/**
 * Render names as a comma-separated list of double-quoted strings, for the
 * `resources: [...]` and `agents: [...]` arguments in generated tool calls.
 * Names are not escaped: they are registry identifiers.
 * @param {string[]} items
 * @returns {string}
 */
function quotedList(items) {
  return items.map((item) => `"${item}"`).join(', ');
}

const ANTIGRAVITY_DELEGATION_LINE = 'Delegate with `invoke_subagent`: one `Subagents` entry per agent, with `TypeName` set to the agent name, a 2-5 word `Role`, and the full delegation prompt as `Prompt`. The call returns at once and each agent\'s final response arrives later as a system message, so end your turn without further tool calls until it does.';

function buildSkillContentLine(entry) {
  const resources = ['architecture', ...entry.skills];
  return `Call \`get_skill_content\` with resources: [${quotedList(resources)}].`;
}

function buildClaudePreamble(entry) {
  if (!entry.agents || entry.agents.length === 0) {
    return '';
  }

  return '## Protocol\n\nBefore delegating, call `get_skill_content` with resources: ["delegation"] and follow the returned methodology.\n';
}

// The skill-content line, then (for entries with agents) the get_agent line
// followed by any runtime-specific delegation lines.
function buildSkillAndAgentRefs(entry, delegationLines = []) {
  const refs = [buildSkillContentLine(entry)];
  if (entry.agents && entry.agents.length > 0) {
    refs.push(`Call \`get_agent\` with agents: [${quotedList(entry.agents)}].`, ...delegationLines);
  }

  return refs.join('\n');
}

module.exports = {
  /** Entry-point preamble builders by runtime name. */
  preambleBuilders: {
    antigravity: (entry) => buildSkillAndAgentRefs(entry, [ANTIGRAVITY_DELEGATION_LINE]),
    claude: buildClaudePreamble,
    codex: (entry) => buildSkillAndAgentRefs(entry),
    qwen: buildSkillContentLine,
  },
  quotedList,
};
