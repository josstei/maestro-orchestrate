'use strict';

const { emitInlineQuotedList } = require('../lib/yaml-emit');

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

function buildCodexPreamble(entry) {
  const refs = [buildSkillContentLine(entry)];
  if (entry.agents && entry.agents.length > 0) {
    refs.push(`Call \`get_agent\` with agents: [${emitInlineQuotedList(entry.agents)}].`);
  }

  return refs.join('\n');
}

function buildAntigravityPreamble(entry) {
  const refs = [buildSkillContentLine(entry)];
  if (entry.agents && entry.agents.length > 0) {
    refs.push(
      `Call \`get_agent\` with agents: [${emitInlineQuotedList(entry.agents)}].`,
      'Delegate with `invoke_subagent`: one `Subagents` entry per agent, with `TypeName` set to the agent name, a 2-5 word `Role`, and the full delegation prompt as `Prompt`. The call returns at once and each agent\'s final response arrives later as a system message, so end your turn without further tool calls until it does.'
    );
  }

  return refs.join('\n');
}

module.exports = {
  antigravity: buildAntigravityPreamble,
  claude: buildClaudePreamble,
  codex: buildCodexPreamble,
  qwen: buildSkillContentLine,
};
