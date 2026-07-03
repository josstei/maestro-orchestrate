'use strict';

const { renderJson } = require('../metadata-shared');
const { buildClaudeLocalMcpConfig, buildClaudeLocalPluginManifest } = require('./metadata');
const { buildPromotedClaudeHookConfig } = require('../../generator/hook-config-emitter');

const CLAUDE_LOCAL_PLUGIN_DIR = 'claude-plugin';
const CLAUDE_LOCAL_BUNDLE_DIR = 'src';

const PROMOTED_CONTENT_COPY_MAP = Object.freeze([
  Object.freeze({ from: 'claude/agents', to: 'agents' }),
  Object.freeze({ from: 'claude/skills', to: 'skills' }),
  Object.freeze({ from: 'claude/scripts', to: 'scripts' }),
  Object.freeze({ from: 'claude/mcp', to: 'mcp' }),
]);

function buildPromotedPluginManifestFiles(context) {
  return [
    { relPath: '.claude-plugin/plugin.json', content: renderJson(buildClaudeLocalPluginManifest(context)) },
    { relPath: '.mcp.json', content: renderJson(buildClaudeLocalMcpConfig()) },
    { relPath: 'hooks/claude-hooks.json', content: renderJson(buildPromotedClaudeHookConfig()) },
  ];
}

module.exports = {
  CLAUDE_LOCAL_PLUGIN_DIR,
  CLAUDE_LOCAL_BUNDLE_DIR,
  PROMOTED_CONTENT_COPY_MAP,
  buildPromotedPluginManifestFiles,
};
