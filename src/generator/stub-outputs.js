'use strict';

const path = require('node:path');
const { findFiles } = require('../lib/discovery');
const { parse } = require('../lib/frontmatter');
const { readTextSync } = require('../lib/io');
const { toNamingConvention } = require('../lib/naming');
const { mapTools } = require('../core/agent-tools');

// stripExamples' EXAMPLE_BLOCK_REGEX from core/feature-blocks, capturing the inner lines.
const EXAMPLE_BLOCK = /^[ \t]*<example>[ \t]*\n([\s\S]*?)^[ \t]*<\/example>[ \t]*\n?/gm;

/** The body's <example> blocks with unindented tags; an unclosed block throws. */
function extractExamples(body) {
  if (/^[ \t]*<example>[ \t]*$/m.test(body.replace(EXAMPLE_BLOCK, ''))) {
    throw new Error('Unclosed <example> tag in agent body');
  }
  return [...body.matchAll(EXAMPLE_BLOCK)].map((match) => `<example>\n${match[1]}</example>`);
}

// Discovery frontmatter, then a pointer to the MCP tool that serves the full content.
const stubDocument = (frontmatter, pointer) => ['---', ...frontmatter, '---', '', pointer, ''].join('\n');

/**
 * Builds an agent discovery stub: runtime-specific frontmatter (the fields
 * listed in `runtime.agentFrontmatter.fields`, in that order, with
 * `<example>` blocks from the body appended to the description when the
 * runtime enables `features.exampleBlocks`) followed by a body that points
 * at the MCP `get_agent` tool. The source methodology body is not emitted.
 * The name, description, color, tools and turns fields are computed from
 * the agent; any other listed field emits its `agentFrontmatter` value.
 * @throws {Error} When a listed field is neither computed nor set in `agentFrontmatter`
 */
function agentStub(content, runtime) {
  const { frontmatter, body } = parse(content);
  const examples = runtime.features?.exampleBlocks ? extractExamples(body) : [];
  const fm = runtime.agentFrontmatter;
  const tools = mapTools(frontmatter, runtime);

  const name = toNamingConvention(frontmatter.name, runtime.agentNaming);
  const baseDescription = frontmatter.description || '';
  const description = examples.length ? baseDescription + '\n\n' + examples.join('\n') : baseDescription;
  // Escape \ and " for the double-quoted scalar; a non-string scalar is interpolated as is.
  const quoted = typeof baseDescription === 'string' ? baseDescription.replace(/[\\"]/g, '\\$&') : baseDescription;
  const computed = {
    name: name != null && name !== '' ? [`name: ${name}`] : [],
    description: runtime.features?.exampleBlocks && description.includes('\n')
      ? ['description: |', ...description.split('\n').map((line) => `  ${line}`)]
      : [`description: "${quoted}"`],
    color: frontmatter.color ? [`color: ${frontmatter.color}`] : [],
    tools: tools.length ? ['tools:', ...tools.map((tool) => `  - ${tool}`)] : [],
    turns: fm.turnsField && frontmatter.max_turns != null
      ? [`${fm.turnsField}: ${frontmatter.max_turns}`] : [],
  };

  const lines = fm.fields.flatMap((fieldName) => {
    if (Object.hasOwn(computed, fieldName)) return computed[fieldName];
    if (fm[fieldName] != null) return [`${fieldName}: ${fm[fieldName]}`];
    throw new Error(`Unknown agent frontmatter field "${fieldName}" for ${runtime.name}`);
  });
  return stubDocument(lines, 'Agent methodology loaded via MCP tool `get_agent`. ' +
    `Call \`get_agent(agents: ["${frontmatter.name || ''}"])\` to read the full methodology at delegation time.`);
}

/** A shared-skill stub: the host's discovery metadata, then a `get_skill_content` pointer. */
function skillDiscoveryStub(content, runtime) {
  const { name, description } = parse(content).frontmatter;
  return stubDocument([
    ...(name ? [`name: ${name}`] : []),
    ...(description ? [`description: ${description}`] : []),
    // Shared skills are methodology the orchestrator loads, not commands: keep
    // them out of the host's slash-command menu.
    ...(runtime.skillStubFrontmatter || []),
  ], `Methodology loaded via MCP. Call \`get_skill_content(resources: ["${name}"])\`.`);
}

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

module.exports = { agentStub, collectStubOutputs, skillDiscoveryStub };
