import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function resolveMainModuleUrl() {
  const realPath = fs.realpathSync(process.argv[1]);
  return pathToFileURL(realPath).href;
}

function runAsMain(moduleUrl, label, fn) {
  if (moduleUrl !== resolveMainModuleUrl()) return;
  Promise.resolve()
    .then(fn)
    .catch((err) => {
      console.error(`${label} failed: ${err.message}`);
      process.exit(1);
    });
}

export { readJson, runAsMain };
