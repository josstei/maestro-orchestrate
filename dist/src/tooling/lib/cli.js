import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}
function resolveMainModuleUrl() {
    const entrypoint = process.argv[1];
    if (!entrypoint)
        return '';
    const realPath = fs.realpathSync(entrypoint);
    return pathToFileURL(realPath).href;
}
function resolvePackageRoot(startDir) {
    let currentDir = path.resolve(startDir);
    while (true) {
        const packageJsonPath = path.join(currentDir, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            const pkg = readJson(packageJsonPath);
            if (pkg && pkg.name === '@josstei/maestro') {
                return currentDir;
            }
        }
        const parentDir = path.dirname(currentDir);
        if (parentDir === currentDir) {
            throw new Error(`Unable to locate @josstei/maestro package root from ${startDir}`);
        }
        currentDir = parentDir;
    }
}
function runAsMain(moduleUrl, label, fn) {
    if (moduleUrl !== resolveMainModuleUrl())
        return;
    Promise.resolve()
        .then(fn)
        .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`${label} failed: ${message}`);
        process.exit(1);
    });
}
export { readJson, resolvePackageRoot, runAsMain };
