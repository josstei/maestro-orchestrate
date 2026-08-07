import { basename } from 'node:path';

const DOC_EXTENSIONS = new Set(['.md', '.markdown', '.txt', '.rst', '.adoc']);
const EXECUTABLE_OR_CODE_EXTENSIONS = new Set([
  '.yml',
  '.yaml',
  '.sh',
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.mts',
  '.cts',
  '.py',
  '.json',
  '.toml',
  '.go',
  '.rs',
  '.c',
  '.cpp',
  '.h',
  '.java',
]);
const DOC_EXACT_FILES = new Set(['LICENSE', 'NOTICE', 'CHANGELOG', 'README']);

/**
 * Shared classification predicate for documentation paths.
 * Conservative: files not clearly matching documentation rules (such as executable workflows,
 * scripts, code, or data formats) are treated as implementation files.
 */
export function isDocumentationPath(filePath: string): boolean {
  if (!filePath || typeof filePath !== 'string') return false;

  const normalized = filePath.replace(/\\/g, '/').trim();
  if (normalized.length === 0) return false;

  const lower = normalized.toLowerCase();
  const fileBasename = basename(lower);

  // 1. Any code/workflow/executable/data extension is NOT documentation
  const extMatch = fileBasename.match(/\.[a-z0-9]+$/);
  if (extMatch && EXECUTABLE_OR_CODE_EXTENSIONS.has(extMatch[0])) {
    return false;
  }

  // 2. Exact match files (LICENSE, README, etc.)
  const stem = fileBasename.split('.')[0];
  if (stem && DOC_EXACT_FILES.has(stem.toUpperCase())) {
    return true;
  }

  // 3. Known documentation extension
  if (extMatch && DOC_EXTENSIONS.has(extMatch[0])) {
    return true;
  }

  // 4. docs/ directory without code extension
  if (lower.startsWith('docs/') || lower.includes('/docs/')) {
    return true;
  }

  return false;
}
