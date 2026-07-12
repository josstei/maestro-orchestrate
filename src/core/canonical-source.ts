import fs from 'fs';
import path from 'path';

function hasCompiledRuntimeRoot(candidateRoot: string): boolean {
  return fs.existsSync(path.join(candidateRoot, 'dist', 'src', 'mcp', 'maestro-server.js'));
}

function hasCanonicalSrcRoot(candidateRoot: string): boolean {
  return fs.existsSync(path.join(candidateRoot, 'src', 'mcp', 'maestro-server.ts'));
}

function resolveRuntimeContentRoot(projectRoot: string): string {
  const compiledSrcRoot = path.join(projectRoot, 'dist', 'src');
  if (hasCompiledRuntimeRoot(projectRoot)) {
    return compiledSrcRoot;
  }

  return path.join(projectRoot, 'src');
}

function resolveCanonicalProjectRoot(startDir = process.cwd()): string {
  let current = path.resolve(startDir);

  while (true) {
    if (hasCompiledRuntimeRoot(current) || hasCanonicalSrcRoot(current)) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error(`Unable to locate Maestro runtime content root from "${startDir}"`);
    }

    current = parent;
  }
}

function resolveCanonicalSrcRoot(startDir = process.cwd()): string {
  return resolveRuntimeContentRoot(resolveCanonicalProjectRoot(startDir));
}

export { resolveCanonicalProjectRoot, resolveCanonicalSrcRoot, resolveRuntimeContentRoot };
