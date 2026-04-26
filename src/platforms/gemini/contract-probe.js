'use strict';

const { NotCapturedYetError } = require('../shared/contract-probes/not-captured-yet-error');

/**
 * Probe a captured Gemini CLI request payload to extract the runtime contract.
 *
 * @param {object} payload — parsed JSON of a captured Gemini CLI request
 * @returns {import('../shared/contract-probes/types').RuntimeContract}
 */
function probeGeminiContract(payload) {
  if (payload && payload.stub === true) {
    throw new NotCapturedYetError('gemini');
  }
  if (!payload || !Array.isArray(payload.tools)) {
    throw new Error('probeGeminiContract: payload missing tools array');
  }

  const registered_tools = [];
  for (const group of payload.tools) {
    if (!group.functionDeclarations) continue;
    for (const decl of group.functionDeclarations) {
      if (decl && typeof decl.name === 'string') {
        registered_tools.push(decl.name);
      }
    }
  }

  const invokeAgent = (() => {
    for (const group of payload.tools) {
      if (!group.functionDeclarations) continue;
      const found = group.functionDeclarations.find((d) => d.name === 'invoke_agent');
      if (found) return found;
    }
    return null;
  })();

  const delegation_surface = invokeAgent
    ? {
        tool: 'invoke_agent',
        params: Object.keys(invokeAgent.parametersJsonSchema?.properties || {}),
      }
    : { tool: null, params: [] };

  const sysText = payload.systemInstruction?.parts?.[0]?.text || '';
  const subagent_registry_fields = extractSubagentRegistryFields(sysText);

  return {
    registered_tools,
    subagent_registry_fields,
    delegation_surface,
    frontmatter_enforcement: 'unverified',
  };
}

function extractSubagentRegistryFields(sysText) {
  const start = sysText.indexOf('<available_subagents>');
  if (start === -1) return [];
  const end = sysText.indexOf('</available_subagents>', start);
  if (end === -1) return [];
  const block = sysText.slice(start, end);

  const fieldNames = new Set();
  const tagPattern = /<(\w+)>/g;
  let match;
  while ((match = tagPattern.exec(block))) {
    if (match[1] !== 'subagent' && match[1] !== 'available_subagents') {
      fieldNames.add(match[1]);
    }
  }
  return Array.from(fieldNames);
}

module.exports = {
  probeGeminiContract,
  NotCapturedYetError,
};
