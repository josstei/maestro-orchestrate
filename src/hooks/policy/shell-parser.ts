const WRAPPERS = new Set(['env', 'sudo', 'doas', 'nice', 'nohup', 'time', 'command', 'builtin', 'exec', 'ionice', 'stdbuf', 'setsid']);

const VALUE_FLAGS: Record<string, Set<string>> = {
  sudo: new Set(['-u', '-g', '-U', '-C', '-D', '-p', '-h', '-R', '--user', '--group']),
  nice: new Set(['-n', '--adjustment']),
  ionice: new Set(['-c', '-n', '-p']),
  stdbuf: new Set(['-i', '-o', '-e']),
  env: new Set(['-C', '-S', '-u']),
};

function basename(token: any) {
  const i = token.lastIndexOf('/');
  return i === -1 ? token : token.slice(i + 1);
}

function normalizeSegment(segment: any) {
  let toks = segment.trim().replace(/^\\(?=\S)/, '').split(/\s+/).filter(Boolean);
  let progressed = true;
  while (progressed && toks.length > 1) {
    progressed = false;
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(toks[0])) { toks = toks.slice(1); progressed = true; continue; }
    const head = basename(toks[0]);
    if (WRAPPERS.has(head)) {
      const vf = VALUE_FLAGS[head] || new Set();
      toks = toks.slice(1);
      while (toks.length > 1 && toks[0].startsWith('-')) {
        const flag = toks[0]; toks = toks.slice(1);
        if (vf.has(flag) && toks.length > 1 && !toks[0].startsWith('-')) toks = toks.slice(1);
      }
      while (toks.length > 1 && /^[A-Za-z_][A-Za-z0-9_]*=/.test(toks[0])) toks = toks.slice(1);
      progressed = true; continue;
    }
  }
  if (toks.length) toks[0] = basename(toks[0]);
  return toks.join(' ');
}

function readBacktickSubshell(command: any, startIndex: any) {
  let content = '';

  for (let i = startIndex; i < command.length; i++) {
    const ch = command[i];
    if (ch === '\\') {
      const next = command[i + 1];
      if (next === '`') {
        content += '`';
        i++;
        continue;
      }
      content += ch;
      continue;
    }
    if (ch === '`') {
      return { content, end: i };
    }
    content += ch;
  }

  throw new Error('Unterminated backtick command substitution');
}

function readDollarSubshell(command: any, startIndex: any) {
  let content = '';
  let inSingle = false;
  let inDouble = false;
  let escaped = false;

  for (let i = startIndex; i < command.length; i++) {
    const ch = command[i];

    if (escaped) {
      content += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\' && !inSingle) {
      if (command[i + 1] === '`') {
        content += '`';
        i++;
        continue;
      }
      content += ch;
      escaped = true;
      continue;
    }
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      content += ch;
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      content += ch;
      continue;
    }
    if (inSingle) {
      content += ch;
      continue;
    }
    if (ch === '$' && command[i + 1] === '(') {
      const parsed = readDollarSubshell(command, i + 2);
      content += '$(' + parsed.content + ')';
      i = parsed.end;
      continue;
    }
    if (ch === '`') {
      const parsed = readBacktickSubshell(command, i + 1);
      content += '`' + parsed.content + '`';
      i = parsed.end;
      continue;
    }
    if (!inSingle && ch === ')') {
      return { content, end: i };
    }

    content += ch;
  }

  throw new Error('Unterminated $(...) command substitution');
}

function splitCommands(command: any) {
  const parts = [];
  let depth = 0;
  let current = '';
  let inSingle = false;
  let inDouble = false;
  let escaped = false;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];

    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\' && !inSingle) {
      current += ch;
      escaped = true;
      continue;
    }
    if (ch === "'" && !inDouble) { inSingle = !inSingle; current += ch; continue; }
    if (ch === '"' && !inSingle) { inDouble = !inDouble; current += ch; continue; }

    if (!inSingle && ch === '$' && command[i + 1] === '(') {
      const parsed = readDollarSubshell(command, i + 2);
      current += '$(' + parsed.content + ')';
      i = parsed.end;
      continue;
    }
    if (!inSingle && ch === '`') {
      const parsed = readBacktickSubshell(command, i + 1);
      current += '`' + parsed.content + '`';
      i = parsed.end;
      continue;
    }

    if (inSingle || inDouble) {
      current += ch;
      continue;
    }

    if (ch === '(' || ch === '{') { depth++; current += ch; continue; }
    if (ch === ')') {
      if (depth > 0) {
        depth--;
      }
      current += ch;
      continue;
    }
    if (ch === '}') { depth--; current += ch; continue; }

    if (depth === 0) {
      if (ch === ';') {
        parts.push(current);
        current = '';
        continue;
      }
      if (ch === '&' && command[i + 1] === '&') {
        parts.push(current);
        current = '';
        i++;
        continue;
      }
      if (ch === '|' && command[i + 1] === '|') {
        parts.push(current);
        current = '';
        i++;
        continue;
      }
      if (ch === '|') {
        parts.push(current);
        current = '';
        continue;
      }
    }
    current += ch;
  }
  if (current) parts.push(current);
  return parts.map((p: any) => p.trim()).filter(Boolean);
}

function extractSubshells(command: any): string[] {
  const patterns: string[] = [];
  let inSingle = false;
  let inDouble = false;
  let escaped = false;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\' && !inSingle) {
      escaped = true;
      continue;
    }
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (inSingle) continue;

    if (ch === '$' && command[i + 1] === '(') {
      const parsed = readDollarSubshell(command, i + 2);
      const content = parsed.content.trim();
      if (content) {
        patterns.push(content, ...extractSubshells(content));
      }
      i = parsed.end;
      continue;
    }

    if (ch === '`') {
      const parsed = readBacktickSubshell(command, i + 1);
      const content = parsed.content.trim();
      if (content) {
        patterns.push(content, ...extractSubshells(content));
      }
      i = parsed.end;
    }
  }

  return patterns;
}

export { basename, extractSubshells, normalizeSegment, readBacktickSubshell, readDollarSubshell, splitCommands };
