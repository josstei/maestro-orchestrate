'use strict';

const fs = require('fs');
const path = require('path');
const { atomicWriteSync } = require('../../core/atomic-write');
const { resolveExtensionRoot } = require('../utils/extension-root');

/**
 * Handle setup_models tool call.
 * 
 * @param {Object} params - Tool arguments.
 * @param {string} params.mode - The operating mode (quality, balanced, economic, skip).
 * @param {string} projectRoot - The current project root.
 * @returns {Promise<Object>} - Result of the operation.
 */
async function handleSetupModels(params, projectRoot) {
  const mode = params.mode;

  if (mode === 'skip') {
    return { status: 'skipped_model_setup' };
  }

  if (!['quality', 'balanced', 'economic'].includes(mode)) {
    throw new Error(`Invalid mode: ${mode}`);
  }

  const settingsPath = path.join(projectRoot, '.gemini', 'settings.json');

  const extensionRoot = resolveExtensionRoot();
  const modesPath = path.join(extensionRoot, 'src', 'config', 'agent-modes.json');

  let modes;
  try {
    modes = JSON.parse(fs.readFileSync(modesPath, 'utf8'));
  } catch (err) {
    throw new Error(`Failed to read agent-modes.json: ${err.message}`);
  }

  const mapping = modes[mode];
  if (!mapping) {
    throw new Error(`Unknown mode: ${mode}`);
  }

  let settings = {};
  if (fs.existsSync(settingsPath)) {
    try {
      const content = fs.readFileSync(settingsPath, 'utf8');
      settings = JSON.parse(content || '{}');
    } catch (err) {
      throw new Error(`Existing .gemini/settings.json is corrupted`);
    }
  }

  // Ensure experimental.enableAgents is true
  settings.experimental = settings.experimental || {};
  settings.experimental.enableAgents = true;

  // Extend agents.overrides
  settings.agents = settings.agents || {};
  settings.agents.overrides = settings.agents.overrides || {};

  for (const [agent, model] of Object.entries(mapping)) {
    settings.agents.overrides[agent] = {
      ...(settings.agents.overrides[agent] || {}),
      modelConfig: { model },
    };
  }

  // Preserve existing settings while applying overrides
  atomicWriteSync(settingsPath, JSON.stringify(settings, null, 2));

  return { status: 'success', mode };
}

module.exports = {
  handleSetupModels,
};
