import { basename } from 'node:path';

const DOC_EXTENSIONS = new Set(['.md', '.markdown', '.txt', '.rst', '.adoc']);
const DOC_DIRS = ['docs/', '.github/'];
const DOC_EXACT_FILES = new Set(['LICENSE', 'NOTICE', 'CHANGELOG', 'README']);

/**
 * Shared classification predicate for documentation paths.
 * Conservative: files not clearly matching documentation rules are treated as implementation files.
 */
export function isDocumentationPath(filePath: string): boolean {
  if (!filePath || typeof filePath !== 'string') return false;

  const normalized = filePath.replace(/\\/g, '/').trim();
  if (normalized.length === 0) return false;

  const lower = normalized.toLowerCase();
  const fileBasename = basename(lower);

  for (const dir of DOC_DIRS) {
    if (lower.startsWith(dir) || lower.includes(`/${dir}`)) return true;
  }

  for (const ext of DOC_EXTENSIONS) {
    if (fileBasename.endsWith(ext)) return true;
  }

  const parts = fileBasename.split('.');
  const stem = parts[0];
  if (stem && DOC_EXACT_FILES.has(stem.toUpperCase())) return true;

  return false;
}
