import { registerWorkspacePack } from './workspace/index.js';
import { registerSessionPack } from './session/index.js';
import { registerContentPack } from './content/index.js';
import { registerMemoryPack } from './memory/index.js';
import { registerHistoryPack } from './history/index.js';

const DEFAULT_TOOL_PACKS = Object.freeze([
  registerWorkspacePack,
  registerSessionPack,
  registerContentPack,
  registerMemoryPack,
  registerHistoryPack,
]);

export { DEFAULT_TOOL_PACKS };
