'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { toTitleCase } = require('../lib/naming');

const DEFAULT_SRC = path.resolve(__dirname, '..');

const ENTRY_POINT_TEMPLATE_MAP = {
  gemini: { file: 'gemini-command.toml.tmpl', outputPath: (e) => `commands/maestro/${e.name}.toml` },
  claude: { file: 'claude-skill.md.tmpl', outputPath: (e) => `claude/skills/${e.name}/SKILL.md` },
  codex: { file: 'codex-skill.md.tmpl', outputPath: (e) => `plugins/maestro/skills/${e.name}/SKILL.md` },
  qwen: null,
};

const PREAMBLE_PLACEHOLDER_MAP = {
  gemini: 'skills_block',
  claude: 'protocol_block',
  codex: 'refs_list',
  qwen: null,
};

const ENTRY_POINT_NAME_OVERRIDES = {
  codex: {
    debug: 'debug-workflow',
    review: 'review-code',
    resume: 'resume-session',
  },
};

const RESERVED_PUBLIC_SKILL_NAMES = {
  codex: new Set(['review', 'debug', 'resume']),
};

/**
 * @param {string} entryName
 * @param {string} runtimeName
 * @returns {string}
 */
function getEntryPointRuntimeName(entryName, runtimeName) {
  return ENTRY_POINT_NAME_OVERRIDES[runtimeName]?.[entryName] || entryName;
}

/**
 * @param {string} skillName
 * @param {string} runtimeName
 * @throws {Error}
 */
function assertRuntimePublicSkillNameAvailable(skillName, runtimeName) {
  const reservedNames = RESERVED_PUBLIC_SKILL_NAMES[runtimeName];
  if (reservedNames && reservedNames.has(skillName)) {
    throw new Error(
      `Reserved ${runtimeName} public skill name "${skillName}" must be remapped before generation`
    );
  }
}

const GEMINI_SESSION_STATE_BLOCK = `The current session state is provided below:

<session-state>
!{extension_root="\${MAESTRO_EXTENSION_PATH:-$HOME/.gemini/extensions/maestro}"; script="$extension_root/src/scripts/read-active-session.js"; if [[ -f "$script" ]]; then node "$script"; else echo "No active session"; fi}
</session-state>

Use the injected session state above as the source of truth for resume position.

`;

/**
 * @param {string} runtimeName
 * @param {string} [srcDir]
 * @returns {Array<{ outputPath: string, content: string }>}
 */
function expandEntryPoints(runtimeName, srcDir = DEFAULT_SRC) {
  const registry = require(path.join(srcDir, 'entry-points', 'registry'));
  const preambleBuilders = require(path.join(srcDir, 'entry-points', 'preamble-builders'));
  const templateDir = path.join(srcDir, 'entry-points', 'templates');

  const mapping = ENTRY_POINT_TEMPLATE_MAP[runtimeName];
  if (mapping === null) {
    return [];
  }
  if (!mapping) {
    throw new Error(`Unknown runtime for entry-point expansion: "${runtimeName}"`);
  }

  const template = fs.readFileSync(path.join(templateDir, mapping.file), 'utf8');
  const buildPreamble = preambleBuilders[runtimeName];
  const placeholder = PREAMBLE_PLACEHOLDER_MAP[runtimeName];

  return registry.map((entry) => {
    const runtimeEntry = {
      ...entry,
      name: getEntryPointRuntimeName(entry.name, runtimeName),
    };
    assertRuntimePublicSkillNameAvailable(runtimeEntry.name, runtimeName);
    let content = template;

    content = content.replace(/\{\{name\}\}/g, runtimeEntry.name);
    content = content.replace(/\{\{Name\}\}/g, toTitleCase(runtimeEntry.name));
    content = content.replace(/\{\{description\}\}/g, runtimeEntry.description);

    const workflowNumbered = runtimeEntry.workflow
      .map((step, i) => `${i + 1}. ${step}`)
      .join('\n');
    content = content.replace(/\{\{workflow_numbered\}\}/g, workflowNumbered);

    const constraintsList = (runtimeEntry.constraints || [])
      .map((c) => `- ${c}`)
      .join('\n');
    content = content.replace(/\{\{constraints_list\}\}/g, constraintsList);

    const preamble = buildPreamble(runtimeEntry);
    content = content.replace(new RegExp(`\\{\\{${placeholder}\\}\\}`, 'g'), preamble);

    return {
      outputPath: mapping.outputPath(runtimeEntry),
      content,
    };
  });
}

/**
 * @param {string} runtimeName
 * @param {string} [srcDir]
 * @returns {Array<{ outputPath: string, content: string }>}
 */
function expandCoreCommands(runtimeName, srcDir = DEFAULT_SRC) {
  const registry = require(path.join(srcDir, 'entry-points', 'core-command-registry'));
  const templateDir = path.join(srcDir, 'entry-points', 'templates');

  let templateFile, outputPathFn;
  if (runtimeName === 'gemini') {
    templateFile = path.join(templateDir, 'gemini-core-command.toml.tmpl');
    outputPathFn = (entry) => `commands/maestro/${entry.name}.toml`;
  } else if (runtimeName === 'claude') {
    templateFile = path.join(templateDir, 'claude-core-command.md.tmpl');
    outputPathFn = (entry) => `claude/skills/${entry.name}/SKILL.md`;
  } else if (runtimeName === 'codex') {
    templateFile = path.join(templateDir, 'codex-core-command.md.tmpl');
    outputPathFn = (entry) => `plugins/maestro/skills/${entry.name}/SKILL.md`;
  } else if (runtimeName === 'qwen') {
    return [];
  } else {
    throw new Error(`Unknown runtime for core-command expansion: "${runtimeName}"`);
  }

  const template = fs.readFileSync(templateFile, 'utf8');

  return registry.map((entry) => {
    const runtimeEntry = {
      ...entry,
      name: getEntryPointRuntimeName(entry.name, runtimeName),
    };
    assertRuntimePublicSkillNameAvailable(runtimeEntry.name, runtimeName);
    let content = template;

    content = content.replace(/\{\{name\}\}/g, runtimeEntry.name);
    content = content.replace(/\{\{description\}\}/g, runtimeEntry.description);
    content = content.replace(/\{\{firstLine\}\}/g, runtimeEntry.firstLine);
    content = content.replace(/\{\{requestType\}\}/g, runtimeEntry.requestType);
    content = content.replace(/\{\{executeInstructions\}\}/g, runtimeEntry.executeInstructions);

    const preloadList = runtimeEntry.preload.map((r) => `"${r}"`).join(', ');
    content = content.replace(/\{\{preloadList\}\}/g, preloadList);

    const sessionBlock = (runtimeName === 'gemini' && runtimeEntry.geminiSessionStateInjection)
      ? GEMINI_SESSION_STATE_BLOCK
      : '';
    content = content.replace(/\{\{sessionStateBlock\}\}/g, sessionBlock);

    return {
      outputPath: outputPathFn(runtimeEntry),
      content,
    };
  });
}

module.exports = { expandEntryPoints, expandCoreCommands };
