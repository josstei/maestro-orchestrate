'use strict';

/**
 * Resolve an agent's declared tools for a runtime: the `tools.<runtime>`
 * override when present, else `tools`, each name mapped (and flattened)
 * through runtimeConfig.tools, without duplicates. Unmapped names pass
 * through unchanged. Several canonical tools can map to one runtime tool
 * (Antigravity reads single files, many files and skills all with
 * view_file), so each name keeps its first position.
 *
 * Shared by the agent-stub transform (the stub's `tools:` list) and get_agent
 * (the served `tools`), so both report the same list for an agent.
 *
 * @param {object} frontmatter - Parsed agent frontmatter
 * @param {object} runtimeConfig - Runtime config (name, tools)
 * @returns {string[]} Runtime tool names in first-seen order
 */
function mapTools(frontmatter, runtimeConfig) {
  const declared = frontmatter[`tools.${runtimeConfig.name}`] || frontmatter.tools;

  return [...new Set((Array.isArray(declared) ? declared : [])
    .filter(Boolean)
    .flatMap((toolName) => (runtimeConfig.tools && runtimeConfig.tools[toolName]) || toolName))];
}

module.exports = { mapTools };
