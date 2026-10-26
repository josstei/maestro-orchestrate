'use strict';

const path = require('node:path');
const { findFiles } = require('../lib/discovery');
const { readTextSync } = require('../lib/io');
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
  // Agent stubs go to runtimes with agent frontmatter and shared-skill stubs to
  // runtimes whose entry points are skills.
  const ordered = Object.keys(runtimes).sort().map((name) => runtimes[name]);
  const agentTargets = ordered.filter((runtime) => runtime.agentFrontmatter);
  const skillTargets = ordered.filter((runtime) => runtime.entrySurface === 'skill');
  const outputs = [];
  for (const { file, agent } of sources) {
    const source = path.relative(srcDir, file);
    const content = readTextSync(file);
    for (const runtime of agent ? agentTargets : skillTargets) {
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
