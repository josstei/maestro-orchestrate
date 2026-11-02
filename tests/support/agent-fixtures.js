'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { writeTree } = require('./fs');
const { SRC_ROOT } = require('./paths');

const OUTPUT_CONTRACT = 'agents/shared/handoff-report.md';

/**
 * Writes `agents/<agentName>.md` into a fake canonical src/ root, together
 * with a copy of the shared Output Contract fragment that get_agent appends
 * to every agent body. Returns the fragment content.
 */
function writeAgentFixture(srcRoot, agentName, content) {
  writeTree(srcRoot, `agents/${agentName}.md`, content);
  const contract = fs.readFileSync(path.join(SRC_ROOT, OUTPUT_CONTRACT), 'utf8');
  writeTree(srcRoot, OUTPUT_CONTRACT, contract);
  return contract;
}

module.exports = {
  writeAgentFixture,
};
