import { toSnakeCase } from '../lib/naming/index.js';
import { readFileSync } from 'node:fs';

export type AgentCapability = 'read_only' | 'read_shell' | 'read_write' | 'full';

interface AgentRegistryEntry {
  readonly name: string;
  readonly capabilities: AgentCapability;
}

const agentRegistryData = JSON.parse(
  readFileSync(new URL('../generated/agent-registry.json', import.meta.url), 'utf8')
) as AgentRegistryEntry[];

const KNOWN_AGENTS = Object.freeze(
  agentRegistryData.map((entry) => toSnakeCase(entry.name))
);

const AGENT_CAPABILITIES = Object.freeze(
  Object.fromEntries(
    agentRegistryData.map((entry) => [toSnakeCase(entry.name), entry.capabilities])
  )
);

function normalizeAgentName(name: unknown): string {
  if (typeof name !== 'string') return '';
  return toSnakeCase(name.toLowerCase());
}

function detectAgentFromPrompt(prompt: unknown): string {
  if (typeof prompt === 'string') {
    const headerMatch = prompt.match(/(?:^|\n)\s*agent:\s*([a-z0-9_-]+)/i);
    const headerAgent = normalizeAgentName(headerMatch?.[1] || '');
    if (headerAgent && KNOWN_AGENTS.includes(headerAgent)) {
      return headerAgent;
    }
  }

  return '';
}

function getAgentCapability(name: unknown): AgentCapability | null {
  const normalized = normalizeAgentName(name);
  return AGENT_CAPABILITIES[normalized] || null;
}

function canCreateFiles(name: unknown): boolean {
  const cap = getAgentCapability(name);
  return cap === 'read_write' || cap === 'full';
}

export { KNOWN_AGENTS, AGENT_CAPABILITIES, normalizeAgentName, detectAgentFromPrompt, getAgentCapability, canCreateFiles };
