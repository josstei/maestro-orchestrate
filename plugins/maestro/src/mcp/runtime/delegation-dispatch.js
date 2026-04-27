'use strict';

const { toSnakeCase, toKebabCase } = require('../../lib/naming');

function formatAgentName(canonicalName, runtimeConfig) {
  return runtimeConfig.agentNaming === 'snake_case'
    ? toSnakeCase(canonicalName)
    : toKebabCase(canonicalName);
}

function applyAgentTemplate(template, agentName) {
  if (typeof template !== 'string' || template.length === 0) {
    return agentName;
  }
  return template.replace(/\{\{\s*agent\s*\}\}/g, agentName);
}

function fallbackDispatch(runtimeConfig, agentName) {
  const delegation = runtimeConfig.delegation || {};
  const toolName = delegation.surface_tool || agentName;
  return {
    mode: delegation.surface_tool ? 'brokered' : 'direct',
    tool_name: toolName,
    agent_name: agentName,
    agent_param: delegation.surface_tool ? 'agent_name' : null,
    prompt_param: delegation.surface_tool ? 'prompt' : 'query',
    call_pattern: delegation.pattern || '',
  };
}

function createAgentDispatch(runtimeConfig, canonicalName) {
  const agentName = formatAgentName(canonicalName, runtimeConfig);
  const delegation = runtimeConfig.delegation || {};
  const configDispatch = delegation.dispatch || null;

  if (!configDispatch) {
    return fallbackDispatch(runtimeConfig, agentName);
  }

  return {
    mode: configDispatch.mode || 'direct',
    tool_name: configDispatch.tool_name || delegation.surface_tool || agentName,
    agent_name: applyAgentTemplate(configDispatch.agent_name_template, agentName),
    agent_param: configDispatch.agent_param || null,
    prompt_param: configDispatch.prompt_param || 'prompt',
    call_pattern: configDispatch.call_pattern || delegation.pattern || '',
  };
}

function createRuntimeDispatch(runtimeConfig) {
  const delegation = runtimeConfig.delegation || {};
  const configDispatch = delegation.dispatch || null;

  if (!configDispatch) {
    return {
      mode: delegation.surface_tool ? 'brokered' : 'direct',
      tool_name: delegation.surface_tool || null,
      agent_name_template: '{{agent}}',
      agent_param: delegation.surface_tool ? 'agent_name' : null,
      prompt_param: delegation.surface_tool ? 'prompt' : 'query',
      call_pattern: delegation.pattern || '',
    };
  }

  return {
    mode: configDispatch.mode || 'direct',
    tool_name: configDispatch.tool_name || delegation.surface_tool || null,
    agent_name_template: configDispatch.agent_name_template || '{{agent}}',
    agent_param: configDispatch.agent_param || null,
    prompt_param: configDispatch.prompt_param || 'prompt',
    call_pattern: configDispatch.call_pattern || delegation.pattern || '',
  };
}

module.exports = {
  createAgentDispatch,
  createRuntimeDispatch,
  formatAgentName,
};
