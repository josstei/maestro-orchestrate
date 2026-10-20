'use strict';

const { emitInlineQuotedList } = require('../lib/yaml-emit');

const ANTIGRAVITY_DELEGATION_LINE = 'Delegate with `invoke_subagent`: one `Subagents` entry per agent, with `TypeName` set to the agent name, a 2-5 word `Role`, and the full delegation prompt as `Prompt`. The call returns at once and each agent\'s final response arrives later as a system message, so end your turn without further tool calls until it does.';

function buildSkillContentLine(entry) {
  const resources = ['architecture', ...entry.skills];
  return `Call \`get_skill_content\` with resources: [${emitInlineQuotedList(resources)}].`;
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
    refs.push(`Call \`get_agent\` with agents: [${emitInlineQuotedList(entry.agents)}].`, ...delegationLines);
  }

  return refs.join('\n');
}

module.exports = {
  antigravity: (entry) => buildSkillAndAgentRefs(entry, [ANTIGRAVITY_DELEGATION_LINE]),
  claude: buildClaudePreamble,
  codex: (entry) => buildSkillAndAgentRefs(entry),
  qwen: buildSkillContentLine,
};
