'use strict';

const KNOWN_AGENTS = Object.freeze([
  'architect',
  'api_designer',
  'code_reviewer',
  'coder',
  'data_engineer',
  'debugger',
  'devops_engineer',
  'performance_engineer',
  'refactor',
  'security_engineer',
  'technical_writer',
  'tester',
  'seo_specialist',
  'copywriter',
  'content_strategist',
  'ux_designer',
  'accessibility_specialist',
  'product_manager',
  'analytics_engineer',
  'i18n_specialist',
  'design_system_engineer',
  'compliance_reviewer',
]);

const AGENT_CAPABILITIES = Object.freeze({
  architect: 'read_only',
  api_designer: 'read_only',
  code_reviewer: 'read_only',
  content_strategist: 'read_only',
  compliance_reviewer: 'read_only',
  debugger: 'read_shell',
  performance_engineer: 'read_shell',
  security_engineer: 'read_shell',
  seo_specialist: 'read_shell',
  accessibility_specialist: 'read_shell',
  technical_writer: 'read_write',
  product_manager: 'read_write',
  ux_designer: 'read_write',
  copywriter: 'read_write',
  coder: 'full',
  data_engineer: 'full',
  devops_engineer: 'full',
  tester: 'full',
  refactor: 'full',
  design_system_engineer: 'full',
  i18n_specialist: 'full',
  analytics_engineer: 'full',
});

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
