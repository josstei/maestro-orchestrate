'use strict';

/**
 * An agent's declared tools: the `tools.<runtimeName>` override when a
 * runtime is named and the agent declares one, else `tools`, without empty
 * entries. A missing or non-list value declares no tools.
 *
 * Shared by mapTools and the generator's registry scanner (which tiers the
 * canonical `tools`), so a tier never counts tools the agent is not given.
 *
 * @param {object} frontmatter - Parsed agent frontmatter
 * @param {string} [runtimeName] - Runtime whose override applies
 * @returns {string[]} Declared tool names
 */
function declaredTools(frontmatter, runtimeName) {
  const declared = (runtimeName && frontmatter[`tools.${runtimeName}`]) || frontmatter.tools;
  return Array.isArray(declared) ? declared.filter(Boolean) : [];
}

/**
 * Resolve an agent's declared tools for a runtime, each name mapped (and
 * flattened) through runtimeConfig.tools, without duplicates. Unmapped names
 * pass through unchanged. Several canonical tools can map to one runtime tool
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
  return [...new Set(declaredTools(frontmatter, runtimeConfig.name)
    .flatMap((toolName) => runtimeConfig.tools[toolName] || toolName))];
}

module.exports = { declaredTools, mapTools };
