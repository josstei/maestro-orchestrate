import path from 'node:path';
import { fileURLToPath } from 'node:url';

function moduleFilename(moduleUrl: string): string {
  return fileURLToPath(moduleUrl);
}

function moduleDirname(moduleUrl: string): string {
  return path.dirname(moduleFilename(moduleUrl));
}

export { moduleDirname, moduleFilename };
