'use strict';

const fs = require('fs');
const path = require('path');

const RESOURCE_ALLOWLIST = Object.freeze({
  'delegation':               'skills/delegation/SKILL.md',
  'execution':                'skills/execution/SKILL.md',
  'validation':               'skills/validation/SKILL.md',
  'session-management':       'skills/session-management/SKILL.md',
  'implementation-planning':  'skills/implementation-planning/SKILL.md',
  'code-review':              'skills/code-review/SKILL.md',
  'design-dialogue':          'skills/design-dialogue/SKILL.md',
  'agent-base-protocol':      'skills/delegation/protocols/agent-base-protocol.md',
  'filesystem-safety-protocol': 'skills/delegation/protocols/filesystem-safety-protocol.md',
  'design-document':          'templates/design-document.md',
  'implementation-plan':      'templates/implementation-plan.md',
  'session-state':            'templates/session-state.md',
  'architecture':             'references/architecture.md',
  'orchestration-steps':      'references/orchestration-steps.md',
});

function resolveExtensionRoot() {
  if (process.env.MAESTRO_EXTENSION_PATH) {
    return process.env.MAESTRO_EXTENSION_PATH;
  }
  const serverFile = process.argv[1];
  if (serverFile) {
    return path.resolve(path.dirname(serverFile), '..');
  }
  return process.cwd();
}

function handleGetSkillContent(params) {
  const resources = params.resources;
  if (!Array.isArray(resources) || resources.length === 0) {
    throw new Error('resources must be a non-empty array of resource identifiers');
  }

  const extensionRoot = resolveExtensionRoot();
  const contents = {};
  const errors = {};

  for (const id of resources) {
    const relativePath = RESOURCE_ALLOWLIST[id];
    if (!relativePath) {
      errors[id] = `Unknown resource identifier: "${id}". Known identifiers: ${Object.keys(RESOURCE_ALLOWLIST).join(', ')}`;
      continue;
    }

    const absolutePath = path.join(extensionRoot, relativePath);
    try {
      contents[id] = fs.readFileSync(absolutePath, 'utf8');
    } catch (err) {
      errors[id] = `Failed to read resource "${id}": ${err.code || 'UNKNOWN'}`;
    }
  }

  return { contents, errors };
}

module.exports = { handleGetSkillContent, RESOURCE_ALLOWLIST };
