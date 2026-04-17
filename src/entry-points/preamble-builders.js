'use strict';

const { emitInlineQuotedList } = require('../lib/yaml-emit');

function buildGeminiPreamble(entry) {
  const resources = [];
  if (entry.refs && entry.refs.includes('architecture')) {
    resources.push('architecture');
  }
  for (const skill of entry.skills || []) {
    resources.push(skill);
  }

  if (resources.length === 0) {
    return '';
  }

  return `Call \`get_skill_content\` with resources: [${emitInlineQuotedList(resources)}].`;
}

function buildClaudePreamble(entry) {
  if (!entry.agents || entry.agents.length === 0) {
    return '';
  }

  return '## Protocol\n\nBefore delegating, call `get_skill_content` with resources: ["delegation"] and follow the returned methodology.\n';
}

function buildCodexPreamble(entry) {
  const refs = [];
  const resources = [];

  if (entry.refs && entry.refs.includes('architecture')) {
    resources.push('architecture');
  }
  for (const skill of entry.skills || []) {
    resources.push(skill);
  }

  if (resources.length > 0) {
    refs.push(`Call \`get_skill_content\` with resources: [${emitInlineQuotedList(resources)}].`);
  }
  if (entry.agents && entry.agents.length > 0) {
    refs.push(`Call \`get_agent\` with agents: [${emitInlineQuotedList(entry.agents)}].`);
  }

  return refs.join('\n');
}

module.exports = {
  gemini: buildGeminiPreamble,
  claude: buildClaudePreamble,
  codex: buildCodexPreamble,
};
