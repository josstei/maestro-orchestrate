import { createToolPack as createWorkspaceToolPack } from './workspace/index.js';
import { createToolPack as createSessionToolPack } from './session/index.js';
import { createToolPack as createContentToolPack } from './content/index.js';
import { createToolPack as createMemoryToolPack } from './memory/index.js';
import { createToolPack as createHistoryToolPack } from './history/index.js';

const DEFAULT_TOOL_PACKS = Object.freeze([
  createWorkspaceToolPack,
  createSessionToolPack,
  createContentToolPack,
  createMemoryToolPack,
  createHistoryToolPack,
]);

export { DEFAULT_TOOL_PACKS };
