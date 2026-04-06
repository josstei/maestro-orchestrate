#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { atomicWriteSync } = require('../lib/core/atomic-write');
const { resolveProjectRoot } = require('../lib/core/project-root-resolver');

/**
 * Script to handle project-specific model selection for Maestro subagents.
 * Checks for .gemini/settings.json and prompts for a choice of 3 modes if missing.
 */

async function main() {
  const projectRoot = resolveProjectRoot();
  const settingsPath = path.join(projectRoot, '.gemini', 'settings.json');

  if (fs.existsSync(settingsPath)) {
    // Already configured
    return;
  }

  const mode = process.argv[2];
  if (!mode) {
    // If no mode is provided, we just exit.
    // The orchestrator is responsible for providing the mode.
    return;
  }

  // Handle "skip" mode which only enables agents without overrides
  if (mode === 'skip') {
    const settings = {
      experimental: {
        enableAgents: true
      }
    };
    try {
      atomicWriteSync(settingsPath, JSON.stringify(settings, null, 2));
      console.log('Maestro initialized with default model inheritance.');
      console.log(`Settings saved to ${settingsPath}`);
    } catch (err) {
      console.error('Failed to write settings.json:', err.message);
      process.exit(1);
    }
    return;
  }

  if (!['quality', 'balanced', 'economic'].includes(mode)) {
    console.error(`Invalid mode: ${mode}`);
    process.exit(1);
  }

  // Resolve the extension path to read the mode mapping
  const extensionRoot = process.env.MAESTRO_EXTENSION_PATH || path.resolve(__dirname, '..');
  const modesPath = path.join(extensionRoot, 'lib', 'config', 'agent-modes.json');

  let modes;
  try {
    modes = JSON.parse(fs.readFileSync(modesPath, 'utf8'));
  } catch (err) {
    console.error('Failed to read agent-modes.json:', err.message);
    process.exit(1);
  }

  const mapping = modes[mode];
  if (!mapping) {
    console.error(`Unknown mode: ${mode}`);
    process.exit(1);
  }

  // Prepare the settings.json content
  const settings = {
    experimental: {
      enableAgents: true
    },
    agents: {
      overrides: {}
    }
  };

  for (const [agent, model] of Object.entries(mapping)) {
    settings.agents.overrides[agent] = {
      model: model
    };
  }

  try {
    atomicWriteSync(settingsPath, JSON.stringify(settings, null, 2));
    console.log(`Successfully configured Maestro with "${mode}" mode.`);
    console.log(`Settings saved to ${settingsPath}`);
  } catch (err) {
    console.error('Failed to write settings.json:', err.message);
    process.exit(1);
  }
}

main();
