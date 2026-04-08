'use strict';

const { createToolPack: createWorkspaceToolPack } = require('./workspace');
const { createToolPack: createSessionToolPack } = require('./session');
const { createToolPack: createContentToolPack } = require('./content');

const DEFAULT_TOOL_PACKS = Object.freeze([
  createWorkspaceToolPack,
  createSessionToolPack,
  createContentToolPack,
]);

module.exports = {
  DEFAULT_TOOL_PACKS,
};
