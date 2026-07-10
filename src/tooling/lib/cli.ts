import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

function readJson(filePath: string): any {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function resolveMainModuleUrl(): string {
  const entrypoint = process.argv[1];
  if (!entrypoint) return '';

  const realPath = fs.realpathSync(entrypoint);
  return pathToFileURL(realPath).href;
}

function runAsMain(moduleUrl: string, label: string, fn: () => unknown | Promise<unknown>): void {
  if (moduleUrl !== resolveMainModuleUrl()) return;
  Promise.resolve()
    .then(fn)
    .catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`${label} failed: ${message}`);
      process.exit(1);
    });
}

export { readJson, runAsMain };
export { resolvePackageRoot } from '../../core/package-root.js';
