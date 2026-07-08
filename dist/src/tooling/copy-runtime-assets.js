import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirname = path.dirname(moduleFilename);
const ROOT = path.resolve(moduleDirname, '../../..');
const SRC = path.join(ROOT, 'src');
const DIST_SRC = path.join(ROOT, 'dist', 'src');
const RUNTIME_CONTENT_REGISTRY = 'runtime-content-registry.json';
const RUNTIME_CONTENT_PAYLOAD = 'runtime-content-registry.txt';
const ASSET_ROOTS = Object.freeze([
    'entry-points/templates',
    'generated',
]);
const RUNTIME_CONTENT_ROOTS = Object.freeze([
    'agents',
    'skills',
    'references',
    'templates',
]);
const ASSET_EXTENSIONS = new Set(['.md', '.tmpl', '.json']);
function copyAssetFile(sourcePath, relativePath) {
    const targetPath = path.join(DIST_SRC, relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
}
function copyAssetsFrom(relativeRoot) {
    const sourceRoot = path.join(SRC, relativeRoot);
    if (!fs.existsSync(sourceRoot)) {
        return 0;
    }
    let copied = 0;
    const queue = [sourceRoot];
    while (queue.length > 0) {
        const currentDir = queue.pop();
        if (!currentDir) {
            continue;
        }
        for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
            const sourcePath = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
                queue.push(sourcePath);
                continue;
            }
            if (!entry.isFile() || !ASSET_EXTENSIONS.has(path.extname(entry.name))) {
                continue;
            }
            copyAssetFile(sourcePath, path.relative(SRC, sourcePath));
            copied += 1;
        }
    }
    return copied;
}
function readJsonAsset(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(SRC, relativePath), 'utf8'));
}
function readRegistryEntry(relativePath) {
    const content = fs.readFileSync(path.join(SRC, relativePath), 'utf8');
    const start = registryPayload.length;
    registryPayload += content;
    return Object.freeze([relativePath, start, content.length]);
}
let registryPayload = '';
function readBlueprintEntries() {
    const blueprintDir = path.join(SRC, 'templates', 'session-blueprints');
    if (!fs.existsSync(blueprintDir)) {
        return {};
    }
    return Object.fromEntries(fs
        .readdirSync(blueprintDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
        .map((entry) => {
        const id = path.basename(entry.name, '.md');
        return [id, readRegistryEntry(path.join('templates', 'session-blueprints', entry.name))];
    })
        .sort(([a], [b]) => a.localeCompare(b)));
}
function createRuntimeContentRegistry() {
    registryPayload = '';
    const resourceRegistry = readJsonAsset('generated/resource-registry.json');
    const agentRegistry = readJsonAsset('generated/agent-registry.json');
    const resources = Object.fromEntries(Object.entries(resourceRegistry)
        .map(([id, relativePath]) => [id, readRegistryEntry(String(relativePath))])
        .sort(([a], [b]) => String(a).localeCompare(String(b))));
    const agents = Object.fromEntries(agentRegistry
        .map((entry) => entry.name)
        .sort((a, b) => a.localeCompare(b))
        .map((name) => [name, readRegistryEntry(path.join('agents', `${name}.md`))]));
    return Object.freeze({
        schemaVersion: 1,
        payload: RUNTIME_CONTENT_PAYLOAD,
        resources,
        agents,
        blueprints: readBlueprintEntries(),
    });
}
function writeRuntimeContentRegistry() {
    const targetPath = path.join(DIST_SRC, 'generated', RUNTIME_CONTENT_REGISTRY);
    const payloadPath = path.join(DIST_SRC, 'generated', RUNTIME_CONTENT_PAYLOAD);
    const registry = createRuntimeContentRegistry();
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, `${JSON.stringify(registry)}\n`);
    fs.writeFileSync(payloadPath, registryPayload);
}
function removeRetiredRuntimeContentRoots() {
    for (const relativeRoot of RUNTIME_CONTENT_ROOTS) {
        fs.rmSync(path.join(DIST_SRC, relativeRoot), { recursive: true, force: true });
    }
}
function copyRuntimeAssets() {
    removeRetiredRuntimeContentRoots();
    const copied = ASSET_ROOTS.reduce((count, relativeRoot) => count + copyAssetsFrom(relativeRoot), 0);
    writeRuntimeContentRegistry();
    return copied + 2;
}
function isDirectInvocation() {
    const entrypoint = process.argv[1];
    return Boolean(entrypoint && path.resolve(entrypoint) === moduleFilename);
}
if (isDirectInvocation()) {
    const copied = copyRuntimeAssets();
    console.log(`Copied ${copied} runtime asset files to ${path.relative(ROOT, DIST_SRC)}`);
}
export { ASSET_ROOTS, RUNTIME_CONTENT_ROOTS, createRuntimeContentRegistry, copyRuntimeAssets };
