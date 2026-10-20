'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { SRC_ROOT } = require('./paths');
const entryPointRegistry = require('../../src/entry-points/registry');
const coreCommandRegistry = require('../../src/entry-points/core-command-registry');

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
 * @param {string} runtime - Runtime whose reserved host command names apply
 * @returns {string[]} Sorted public skill (or command) names on that runtime:
 *   an entry's hostSafeName where the runtime reserves its name
 */
function publicSkillNames(runtime) {
  const { reservedNames } = require(`../../src/generator/runtimes/${runtime}/outputs`).entryPoints;
  return [...entryPointRegistry, ...coreCommandRegistry]
    .map((entry) => (reservedNames.includes(entry.name) ? entry.hostSafeName : entry.name))
    .sort();
}

module.exports = {
  AGENT_COUNT,
  PUBLIC_SKILL_COUNT,
  SHARED_SKILL_COUNT,
  listCanonicalAgents,
  publicSkillNames,
};
