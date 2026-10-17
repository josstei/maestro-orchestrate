'use strict';

const fs = require('node:fs');
const path = require('node:path');

const OUTPUT_CONTRACT_PATH = path.resolve(
  __dirname,
  '../../src/agents/shared/handoff-report.md'
);

/**
 * Copies the shared Output Contract fragment, which get_agent appends to every
 * agent body, into a fake canonical src/ root.
 *
 * @param {string} srcRoot - Absolute path of the fake src/ directory
 * @returns {string} The fragment content
 */
function writeOutputContract(srcRoot) {
  const sharedDir = path.join(srcRoot, 'agents', 'shared');
  fs.mkdirSync(sharedDir, { recursive: true });
  fs.copyFileSync(OUTPUT_CONTRACT_PATH, path.join(sharedDir, 'handoff-report.md'));
  return fs.readFileSync(OUTPUT_CONTRACT_PATH, 'utf8');
}

/**
 * Writes `agents/<agentName>.md` into a fake canonical src/ root, together
 * with the shared Output Contract fragment that get_agent appends to it.
 *
 * @param {string} srcRoot - Absolute path of the fake src/ directory
 * @param {string} agentName - Kebab-case agent name, used as the file name
 * @param {string} content - Full agent file content, frontmatter included
 * @returns {string} The Output Contract fragment content
 */
function writeAgentFixture(srcRoot, agentName, content) {
  const agentsDir = path.join(srcRoot, 'agents');
  fs.mkdirSync(agentsDir, { recursive: true });
  fs.writeFileSync(path.join(agentsDir, `${agentName}.md`), content, 'utf8');
  return writeOutputContract(srcRoot);
}

module.exports = {
  writeAgentFixture,
  writeOutputContract,
};
