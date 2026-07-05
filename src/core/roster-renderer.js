import { toSnakeCase } from '../lib/naming/index.js';

const CAPABILITY_TIER_LABELS = Object.freeze({
  read_only: 'Read-only',
  read_shell: 'Read + shell',
  read_write: 'Read + write',
  full: 'Full access',
});

/**
 * Render the canonical agent roster as a markdown table.
 *
 * @param {Array<{name: string, capabilities: string, focus: string}>} agents - agent-registry entries (kebab-case names)
 * @param {{agentNaming: string}} options - runtime naming convention ('snake_case' | 'kebab-case')
 * @returns {string} markdown table (no trailing newline)
 */
function renderRosterTable(agents, { agentNaming }) {
  const display = (name) => (agentNaming === 'snake_case' ? toSnakeCase(name) : name);
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
