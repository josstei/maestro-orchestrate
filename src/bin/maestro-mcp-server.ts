#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirname = path.dirname(moduleFilename);

function readJson(filePath: string): any {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function resolvePackageRoot(startDir: string): string {
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

const root = resolvePackageRoot(moduleDirname);
const serverPath = path.join(root, 'dist', 'src', 'mcp', 'maestro-server.js');
if (!fs.existsSync(serverPath)) {
  throw new Error('Compiled MCP server not found. Run `npm run build` before launching maestro-mcp-server.');
}
const { main } = await import(pathToFileURL(serverPath).href);
process.env.MAESTRO_RUNTIME = process.env.MAESTRO_RUNTIME || 'codex';
process.env.MAESTRO_EXTENSION_PATH = root;
main();
