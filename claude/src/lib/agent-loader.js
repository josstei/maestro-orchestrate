'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('./frontmatter');

/**
 * Load every agent definition from `src/agents/`.
 * @param {string} [agentsDir] - defaults to `<repo>/src/agents` resolved relative to this file
 * @returns {Array<{ name: string, frontmatter: object, body: string }>}
 */
function loadAgentRoster(agentsDir) {
  const dir = agentsDir || path.join(__dirname, '..', 'agents');
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const raw = fs.readFileSync(path.join(dir, f), 'utf8');
      const { frontmatter, body } = parse(raw);
      return {
        name: path.basename(f, '.md'),
        frontmatter,
        body,
      };
    });
}

module.exports = { loadAgentRoster };
