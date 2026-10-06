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

module.exports = {
  gemini: buildSkillContentLine,
  claude: buildClaudePreamble,
  codex: buildCodexPreamble,
};
