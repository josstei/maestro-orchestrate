'use strict';

const agentRegistryData = require('../generated/agent-registry.json');

const KNOWN_AGENTS = Object.freeze(
  agentRegistryData.map((entry) => entry.name.replace(/-/g, '_'))
);

const AGENT_CAPABILITIES = Object.freeze(
  Object.fromEntries(
    agentRegistryData.map((entry) => [entry.name.replace(/-/g, '_'), entry.capabilities])
  )
);

function normalizeAgentName(name) {
  if (typeof name !== 'string') return '';
  return name.toLowerCase().replace(/-/g, '_');
}

const AGENT_PATTERNS = KNOWN_AGENTS.map((agent) => {
  const escaped = agent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const aliasPattern = escaped.replace(/_/g, '[-_]');
  return {
    agent,
    patterns: [
      new RegExp(`(?:delegate|transfer|hand\\s*off|dispatch|invoke)\\s+(?:to\\s+)?(?:the\\s+)?${aliasPattern}\\b`),
      new RegExp(`@${aliasPattern}\\b`),
    ],
  };
});

function detectAgentFromPrompt(prompt) {
  if (typeof prompt === 'string') {
    const headerMatch = prompt.match(/(?:^|\n)\s*agent:\s*([a-z0-9_-]+)/i);
    const headerAgent = normalizeAgentName(headerMatch?.[1] || '');
    if (headerAgent && KNOWN_AGENTS.includes(headerAgent)) {
      return headerAgent;
    }
  }

  const envAgent = normalizeAgentName(process.env.MAESTRO_CURRENT_AGENT);
  if (envAgent && KNOWN_AGENTS.includes(envAgent)) return envAgent;

  if (!prompt) return '';

  const lower = prompt.toLowerCase();
  for (const { agent, patterns } of AGENT_PATTERNS) {
    if (patterns.some((p) => p.test(lower))) {
      return agent;
    }
  }

  return '';
}

function getAgentCapability(name) {
  const normalized = normalizeAgentName(name);
  return AGENT_CAPABILITIES[normalized] || null;
}

function canCreateFiles(name) {
  const cap = getAgentCapability(name);
  return cap === 'read_write' || cap === 'full';
}

module.exports = { KNOWN_AGENTS, AGENT_CAPABILITIES, normalizeAgentName, detectAgentFromPrompt, getAgentCapability, canCreateFiles };
