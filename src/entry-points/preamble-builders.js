'use strict';

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

  const resourceList = resources.map((r) => `"${r}"`).join(', ');
  return `Call \`get_skill_content\` with resources: [${resourceList}].`;
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
    refs.push(
      `Call \`get_skill_content\` with resources: [${resources.map((r) => `"${r}"`).join(', ')}].`
    );
  }
  if (entry.agents && entry.agents.length > 0) {
    refs.push(
      `Call \`get_agent\` with agents: [${entry.agents.map((agent) => `"${agent}"`).join(', ')}].`
    );
  }

  return refs.join('\n');
}

module.exports = {
  gemini: buildGeminiPreamble,
  claude: buildClaudePreamble,
  codex: buildCodexPreamble,
};
