'use strict';

const { createToolPack: createWorkspaceToolPack } = require('./workspace');
const { createToolPack: createSessionToolPack } = require('./session');
const { createToolPack: createContentToolPack } = require('./content');
const { createToolPack: createMemoryToolPack } = require('./memory');
const { createToolPack: createHistoryToolPack } = require('./history');

const DEFAULT_TOOL_PACKS = Object.freeze([
  createWorkspaceToolPack,
  createSessionToolPack,
  createContentToolPack,
  createMemoryToolPack,
  createHistoryToolPack,
]);

module.exports = {
  DEFAULT_TOOL_PACKS,
};
