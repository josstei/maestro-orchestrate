import fs from 'node:fs';
import path from 'node:path';

const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit']);

function safeRealpath(p: any) {
  let abs = path.resolve(p);
  const tail = [];
  for (;;) {
    try { const real = fs.realpathSync(abs); return tail.length ? path.join(real, ...tail) : real; }
    catch (e: any) {
      if (e.code !== 'ENOENT') return abs;
      const parent = path.dirname(abs);
      if (parent === abs) return path.join(abs, ...tail);
      tail.unshift(path.basename(abs));
      abs = parent;
    }
  }
}

function isWriteAllowed(filePath: any, root: any, allow: any) {
  if (!root || !filePath) return false;
  const target = safeRealpath(filePath);
  const bases = [safeRealpath(root), ...(allow || []).filter(Boolean).map(safeRealpath)];
  return bases.some((b: any) => target === b || target.startsWith(b + path.sep));
}

function resolveWorkspaceRoot(input: any) {
  const root = process.env.MAESTRO_WORKSPACE_PATH || (input && input.cwd) || process.cwd();
  return root ? path.resolve(root) : null;
}

function writeAllowList(env: any = process.env) {
  return [env.MAESTRO_STATE_DIR, ...String(env.MAESTRO_WRITE_ALLOW || '').split(path.delimiter)].filter(Boolean);
}

function checkWriteToolInput(input: any) {
  const fp = (input.tool_input && input.tool_input.file_path) || '';
  const root = resolveWorkspaceRoot(input);
  return isWriteAllowed(fp, root, writeAllowList())
    ? { decision: 'approve' }
    : { decision: 'block', reason: `Write outside workspace boundary: ${fp || '(no path)'}` };
}

export { WRITE_TOOLS, checkWriteToolInput, isWriteAllowed, resolveWorkspaceRoot, safeRealpath, writeAllowList };
