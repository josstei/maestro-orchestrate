import { toSnakeCase } from '../lib/naming/index.js';
import type { AgentCapability } from './agent-registry.js';
import type { AgentNaming } from '../platforms/runtime-descriptor.js';

export interface AgentRosterEntry {
  readonly name: string;
  readonly capabilities: AgentCapability;
  readonly focus: string;
}

const CAPABILITY_TIER_LABELS = Object.freeze({
  read_only: 'Read-only',
  read_shell: 'Read + shell',
  read_write: 'Read + write',
  full: 'Full access',
} satisfies Record<AgentCapability, string>);

/**
 * Render the canonical agent roster as a markdown table.
 *
 * @param agents - agent-registry entries (kebab-case names)
 * @param options - runtime naming convention
 */
function renderRosterTable(agents: readonly AgentRosterEntry[], { agentNaming }: { agentNaming: AgentNaming }): string {
  const display = (name: string) => (agentNaming === 'snake_case' ? toSnakeCase(name) : name);
  const rows = [...agents]
    .map((a) => ({ name: display(a.name), focus: a.focus, tier: CAPABILITY_TIER_LABELS[a.capabilities] }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const lines = ['| Agent | Focus | Capability Tier |', '| --- | --- | --- |'];
  for (const row of rows) {
    lines.push(`| \`${row.name}\` | ${row.focus} | ${row.tier} |`);
  }
  return lines.join('\n');
}

export { renderRosterTable, CAPABILITY_TIER_LABELS };
