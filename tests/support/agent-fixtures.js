'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { writeTree } = require('./fs');
const { SRC_ROOT } = require('./paths');

const OUTPUT_CONTRACT_PATH = path.join(SRC_ROOT, 'agents', 'shared', 'handoff-report.md');

/**
 * Copies the shared Output Contract fragment, which get_agent appends to every
 * agent body, into a fake canonical src/ root.
 *
 * @param {string} srcRoot - Absolute path of the fake src/ directory
 * @returns {string} The fragment content
 */
function writeOutputContract(srcRoot) {
  const contract = fs.readFileSync(OUTPUT_CONTRACT_PATH, 'utf8');
  writeTree(srcRoot, 'agents/shared/handoff-report.md', contract);
  return contract;
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
  writeTree(srcRoot, `agents/${agentName}.md`, content);
  return writeOutputContract(srcRoot);
}

module.exports = {
  writeAgentFixture,
};
