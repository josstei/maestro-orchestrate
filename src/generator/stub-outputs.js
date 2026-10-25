'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { findFiles } = require('../lib/discovery');
const { toNamingConvention } = require('../lib/naming');
const agentStub = require('../transforms/agent-stub');
const skillDiscoveryStub = require('../transforms/skill-discovery-stub');

/** Collect the two discovery-stub surfaces, in source and runtime order. */
function collectStubOutputs(srcDir, runtimes, reportError) {
  const skillsDir = path.join(srcDir, 'skills', 'shared');
  const sources = [
    ...findFiles(path.join(srcDir, 'agents'), '*.md').sort().map((file) => ({ file, agent: true })),
    ...findFiles(skillsDir, '**/SKILL.md').sort().map((file) => ({ file, agent: false })),
  ];
  const outputs = [];
  for (const { file, agent } of sources) {
    const source = path.relative(srcDir, file);
    if (!fs.existsSync(file)) {
      reportError(`Source not found: ${source}`);
      continue;
    }
    const content = fs.readFileSync(file, 'utf8');
    const targets = agent ? ['antigravity', 'claude', 'qwen'] : ['antigravity', 'claude', 'codex'];
    for (const name of targets) {
      const runtime = runtimes[name];
      const relativeOutput = agent
        ? `agents/${toNamingConvention(path.basename(file), runtime.agentNaming)}`
        : `skills/${path.relative(skillsDir, file).split(path.sep).join('/')}`;
      const outputPath = path.posix.join(runtime.outputDir, relativeOutput);
      try {
        outputs.push({ outputPath, content: (agent ? agentStub : skillDiscoveryStub)(content, runtime) });
      } catch (error) {
        reportError(`processing ${source} -> ${outputPath}`, error);
      }
    }
  }
  return outputs;
}

module.exports = { collectStubOutputs };
