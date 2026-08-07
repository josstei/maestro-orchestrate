import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { ArtifactEntrySchema, ArtifactManifestSchema } from './evidence-schema.js';
import type { ArtifactManifest } from './evidence-schema.js';

function computeSha256(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function getMimeCategory(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html':
    case '.htm':
      return 'text/html';
    case '.css':
      return 'text/css';
    case '.js':
    case '.mjs':
    case '.cjs':
      return 'application/javascript';
    case '.json':
      return 'application/json';
    case '.md':
      return 'text/markdown';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}

function isGitTracked(repoRoot: string, relativePath: string): boolean {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', '--', relativePath], {
      cwd: repoRoot,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    return true;
  } catch {
    return false;
  }
}

function assertContainedPath(candidate: string, root: string, label: string): void {
  const relative = path.relative(root, candidate);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${label} must be contained within project root`);
  }
}

export function generateArtifactManifest(targetDir: string, projectRoot: string): ArtifactManifest {
  const resolvedProjectRoot = path.resolve(projectRoot);
  const resolvedTargetDir = path.resolve(targetDir);
  assertContainedPath(resolvedTargetDir, resolvedProjectRoot, 'targetDir');

  const files: Array<Record<string, unknown>> = [];

  function walk(currentDir: string) {
    if (!fs.existsSync(currentDir)) return;
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '.git' || entry.name === 'node_modules') continue;
        walk(fullPath);
      } else if (entry.isFile()) {
        const relativePath = path.relative(resolvedProjectRoot, fullPath).replace(/\\/g, '/');
        const stats = fs.statSync(fullPath);
        const tracked = isGitTracked(resolvedProjectRoot, relativePath);

        files.push({
          relative_path: relativePath,
          bytes: stats.size,
          sha256: computeSha256(fullPath),
          mime_category: getMimeCategory(fullPath),
          tracked,
          created_or_modified: tracked ? 'modified' : 'created',
          validation_results: [],
          content_available: true,
          provenance: 'filesystem_capture',
        });
      }
    }
  }

  walk(resolvedTargetDir);

  files.sort((a, b) => (a.relative_path as string).localeCompare(b.relative_path as string));

  return ArtifactManifestSchema.parse({
    generated_at: new Date().toISOString(),
    files: files.map((entry) => ArtifactEntrySchema.parse(entry)),
  });
}

if (process.argv[1] && process.argv[1].endsWith('artifact-manifest.js')) {
  try {
    const projectRoot = path.resolve(process.argv[3] || process.cwd());
    const targetArg = process.argv[2] || '.';
    const targetDir = path.isAbsolute(targetArg)
      ? path.resolve(targetArg)
      : path.resolve(projectRoot, targetArg);
    const manifest = generateArtifactManifest(targetDir, projectRoot);
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
