import path from 'node:path';
import { discover } from '../lib/discovery/index.js';
import { fileURLToPath, pathToFileURL } from 'node:url';
const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirname = path.dirname(moduleFilename);
const TRANSFORMS_DIR = path.resolve(moduleDirname);
const entries = discover({
    dir: TRANSFORMS_DIR,
    pattern: '*.js',
    identity: (filepath) => path.basename(filepath, '.js'),
    validate: (entry) => entry.id !== 'index',
});
const transforms = Object.create(null);
for (const entry of entries) {
    const { default: transform } = await import(pathToFileURL(path.join(TRANSFORMS_DIR, `${entry.id}.js`)).href);
    transforms[entry.id] = transform;
}
/**
 * Resolve a transform name to its function.
 * Supports parameterized transforms like 'strip-feature:flagName'.
 */
function resolve(name) {
    const [baseName, param] = name.split(':');
    const fn = baseName ? transforms[baseName] : null;
    if (!fn) {
        throw new Error(`Unknown transform: "${baseName}"`);
    }
    return { fn, param: param || null };
}
export { resolve, transforms };
