'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { SRC_ROOT } = require('./paths');
const entryPointRegistry = require('../../src/entry-points/registry');
const coreCommandRegistry = require('../../src/entry-points/core-command-registry');
const { getRuntimeConfig } = require('../../src/platforms/runtime-config-map');

// The catalog sizes are pinned here rather than derived from src/, so every
// generated surface that checks them fails when an agent or skill is added or
// removed without updating the expectation.

/** Canonical agents under src/agents/. */
const AGENT_COUNT = 39;

/** Public skills and commands: the entry points plus the core commands. */
const PUBLIC_SKILL_COUNT = 12;

/** Shared methodology skills under src/skills/shared/. */
const SHARED_SKILL_COUNT = 7;

/**
 * @returns {string[]} Sorted kebab-case names of the canonical agents
 *   (the basenames of src/agents/*.md)
 */
function listCanonicalAgents() {
  return fs
    .readdirSync(path.join(SRC_ROOT, 'agents'))
    .filter((file) => file.endsWith('.md'))
    .map((file) => path.basename(file, '.md'))
    .sort();
}

/**
 * @param {string} runtime - Runtime whose public names to list; skill-surface
 *   runtimes take each entry's skillName override
 * @returns {string[]} Sorted public skill (or command) names on that runtime
 */
function publicSkillNames(runtime) {
  const skills = getRuntimeConfig(runtime).entrySurface === 'skill';
  return [...entryPointRegistry, ...coreCommandRegistry]
    .map((entry) => (skills && entry.skillName) || entry.name)
    .sort();
}

/**
 * The tools Antigravity grants a subagent that lists them in its frontmatter
 * `tools`, verified against agy 1.4.2. Antigravity silently drops any other
 * name (multi_replace_file_content among them), so Maestro's agent stubs may
 * list only these.
 */
const ANTIGRAVITY_SUBAGENT_TOOLS = Object.freeze(new Set([
  'view_file',
  'list_dir',
  'find_by_name',
  'grep_search',
  'search_web',
  'read_url_content',
  'write_to_file',
  'replace_file_content',
  'run_command',
  'ask_question',
]));

/**
 * The clientInfo each host sends in `initialize`, from which the server
 * identifies its runtime. Observed from Claude Code 2.1.303, Codex 0.163.0,
 * Qwen Code 0.25.2 and the Antigravity CLI 1.4.2.
 */
const HOST_CLIENTS = Object.freeze({
  antigravity: { name: 'antigravity-client', version: 'v1.0.0' },
  claude: { name: 'claude-code', version: '2.1.303' },
  codex: { name: 'codex-mcp-client', title: 'Codex', version: '0.163.0' },
  // Qwen Code suffixes the server's key in mcpServers.
  qwen: { name: 'qwen-cli-mcp-client-maestro', version: '0.0.1' },
});

module.exports = {
  AGENT_COUNT,
  ANTIGRAVITY_SUBAGENT_TOOLS,
  HOST_CLIENTS,
  PUBLIC_SKILL_COUNT,
  SHARED_SKILL_COUNT,
  listCanonicalAgents,
  publicSkillNames,
};
