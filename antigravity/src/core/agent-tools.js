'use strict';

/**
 * Resolve an agent's declared tools for a runtime: the `tools.<runtime>`
 * override when present, else `tools`, each name mapped (and flattened)
 * through runtimeConfig.tools, without duplicates. The runtime's agentTools
 * policy can exclude and order default tools; explicit overrides keep their
 * declared selection and order. Unmapped names pass through unchanged.
 * Several canonical tools can map to one runtime tool
 * (Antigravity reads single files, many files and skills all with
 * view_file), so deduplication keeps each name's first position.
 *
 * Shared by the agent-stub transform (the stub's `tools:` list) and get_agent
 * (the served `tools`), so both report the same list for an agent.
 *
 * @param {object} frontmatter - Parsed agent frontmatter
 * @param {object} runtimeConfig - Runtime config (name, tools)
 * @returns {string[]} Runtime tool names in the default policy's order, or first-seen order
 */
function mapTools(frontmatter, runtimeConfig) {
  const override = frontmatter[`tools.${runtimeConfig.name}`];
  const declared = override || frontmatter.tools;

  const mapped = [...new Set((Array.isArray(declared) ? declared : [])
    .filter(Boolean)
    .flatMap((toolName) => (runtimeConfig.tools && runtimeConfig.tools[toolName]) || toolName))];

  if (override || !runtimeConfig.agentTools) return mapped;

  const { exclude = [], order = [] } = runtimeConfig.agentTools;
  const selected = mapped.filter((name) => !exclude.includes(name));
  return [
    ...order.filter((name) => selected.includes(name)),
    ...selected.filter((name) => !order.includes(name)),
  ];
}

module.exports = { mapTools };
