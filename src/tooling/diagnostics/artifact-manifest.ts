import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { ArtifactEntrySchema, ArtifactManifest, ArtifactManifestSchema } from './evidence-schema.js';

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
    execSync(`git ls-files --error-unmatch "${relativePath}"`, {
      cwd: repoRoot,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    return true;
  } catch {
    return false;
  }
}

export function generateArtifactManifest(targetDir: string, projectRoot: string): ArtifactManifest {
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
        const relativePath = path.relative(projectRoot, fullPath).replace(/\\/g, '/');
        const stats = fs.statSync(fullPath);
        const bytes = stats.size;
        const sha256 = computeSha256(fullPath);
        const mime_category = getMimeCategory(fullPath);
        const tracked = isGitTracked(projectRoot, relativePath);

        files.push({
          relative_path: relativePath,
          bytes,
          sha256,
          mime_category,
          tracked,
          created_or_modified: tracked ? 'modified' : 'created',
          validation_results: [],
        });
      }
    }
  }

  walk(targetDir);

  files.sort((a, b) => (a.relative_path as string).localeCompare(b.relative_path as string));

  return ArtifactManifestSchema.parse({
    generated_at: new Date().toISOString(),
    files: files.map((f) => ArtifactEntrySchema.parse(f)),
  });
}
