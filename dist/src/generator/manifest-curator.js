import path from 'node:path';
import { fileURLToPath } from 'node:url';
const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirname = path.dirname(moduleFilename);
const DEFAULT_CODE_SRC = path.resolve(moduleDirname, '..');
async function collectManifestPaths(manifest, runtimes, srcDir, entryPointExpanders, codeSrcDir = DEFAULT_CODE_SRC) {
    const paths = new Set();
    for (const entry of manifest) {
        for (const p of Object.values(entry.outputs))
            paths.add(p);
    }
    for (const fn of entryPointExpanders) {
        for (const rt of Object.keys(runtimes)) {
            for (const { outputPath } of await fn(rt, srcDir, codeSrcDir))
                paths.add(outputPath);
        }
    }
    return paths;
}
export { collectManifestPaths };
