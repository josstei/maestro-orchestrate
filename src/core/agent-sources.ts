import fs from 'node:fs';
import path from 'node:path';
import { escapeYaml } from '../lib/frontmatter/index.js';

type AgentExample = Readonly<{
  context: string;
  user: string;
  assistant: string;
  commentary: string;
}>;

type AgentSource = Readonly<{
  name: string;
  relativePath: string;
  content: string;
  origin: 'physical' | 'composed';
}>;

type ToolProfile = Readonly<{
  tools: string[];
  claude: string[];
  turns: string;
  temperature: string;
  timeout: string;
  capability: string;
}>;

type AgentProfile = Readonly<{
  name: string;
  toolProfile: string;
  color: string;
  focus: string;
  description: string;
  examples: AgentExample[];
  body: string;
}>;

const PROFILE_DIR = 'agent-profiles';
const PROFILE_EXTENSION = '.profile';
const TOOL_ALIASES: Record<string, string> = {
  r: 'read_file', l: 'list_directory', g: 'glob', s: 'grep_search',
  w: 'write_file', e: 'replace', h: 'run_shell_command', o: 'google_web_search',
  t: 'write_todos', m: 'read_many_files', u: 'ask_user', f: 'web_fetch', k: 'activate_skill',
};
const CLAUDE_TOOL_ALIASES: Record<string, string> = {
  R: 'Read', W: 'Write', E: 'Edit', B: 'Bash', G: 'Glob', P: 'Grep',
  S: 'WebSearch', F: 'WebFetch', C: 'TaskCreate', U: 'TaskUpdate', L: 'TaskList', K: 'Skill',
};

function part(parts: string[], index: number, line: string): string {
  const value = parts[index];
  if (value == null) {
    throw new Error(`Bad profile line: ${line}`);
  }
  return value;
}

function split(line: string, expected: number): string[] {
  const parts = line.split('|');
  if (parts.length !== expected) {
    throw new Error(`Bad profile line: ${line}`);
  }
  return parts;
}

function csv(value: string, aliases: Record<string, string>): string[] {
  return value === '' ? [] : value.split(',').map((entry) => aliases[entry] || entry);
}

function tagged(lines: string[], index: number, tag: string, profilePath: string): string {
  const line = lines[index];
  if (!line?.startsWith(`${tag}|`)) {
    throw new Error(`${profilePath} missing ${tag} at ${index + 1}`);
  }
  return line.slice(2);
}

function profileFiles(srcDir: string): string[] {
  const dir = path.join(srcDir, PROFILE_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(PROFILE_EXTENSION))
    .map((entry) => path.join(dir, entry.name))
    .sort();
}

function parseProfileContent(content: string, profilePath: string): AgentSource[] {
  const lines = content.split('\n');
  if (lines[0] !== '1') {
    throw new Error(`${profilePath} bad schema`);
  }

  const tools = new Map<string, ToolProfile>();
  const agents: AgentProfile[] = [];
  for (let index = 1; index < lines.length;) {
    const line = lines[index] || '';
    if (line === '') {
      index++;
      continue;
    }

    if (line.startsWith('T|')) {
      const fields = split(line, 8);
      const id = part(fields, 1, line);
      if (tools.has(id)) throw new Error(`${profilePath} duplicate tool "${id}"`);
      tools.set(id, {
        tools: csv(part(fields, 2, line), TOOL_ALIASES),
        claude: csv(part(fields, 3, line), CLAUDE_TOOL_ALIASES),
        turns: part(fields, 4, line),
        temperature: part(fields, 5, line),
        timeout: part(fields, 6, line),
        capability: part(fields, 7, line),
      });
      index++;
      continue;
    }

    const fields = split(line, 5);
    if (part(fields, 0, line) !== 'A') {
      throw new Error(`${profilePath} missing agent at ${index + 1}`);
    }
    const name = part(fields, 1, line);
    const description = tagged(lines, index + 1, 'D', profilePath);
    const examples: AgentExample[] = [];
    index += 2;
    while (lines[index]?.startsWith('E|')) {
      examples.push({
        context: tagged(lines, index, 'E', profilePath),
        user: tagged(lines, index + 1, 'U', profilePath),
        assistant: tagged(lines, index + 2, 'S', profilePath),
        commentary: tagged(lines, index + 3, 'C', profilePath),
      });
      index += 4;
    }
    if (examples.length !== 2 || lines[index] !== 'B') {
      throw new Error(`${profilePath} bad examples/body for ${name}`);
    }

    const bodyLines: string[] = [];
    for (index++; index < lines.length && lines[index] !== '.'; index++) {
      bodyLines.push(lines[index] || '');
    }
    if (lines[index] !== '.') throw new Error(`${profilePath} missing terminator for ${name}`);
    index++;
    agents.push({
      name,
      toolProfile: part(fields, 2, line),
      color: part(fields, 3, line),
      focus: part(fields, 4, line),
      description,
      examples,
      body: `${bodyLines.join('\n')}\n`,
    });
  }

  return agents.map((agent) => {
    const toolProfile = tools.get(agent.toolProfile);
    if (!toolProfile) {
      throw new Error(`${profilePath} ${agent.name} unknown tool "${agent.toolProfile}"`);
    }
    return {
      name: agent.name,
      relativePath: path.posix.join('agents', `${agent.name}.md`),
      content: renderAgent(agent, toolProfile),
      origin: 'composed' as const,
    };
  });
}

function parseProfileFile(profilePath: string): AgentSource[] {
  return parseProfileContent(fs.readFileSync(profilePath, 'utf8'), profilePath);
}

function renderAgentProfileSources(profiles: readonly { profilePath: string; content: string }[]): AgentSource[] {
  return profiles.flatMap((profile) => parseProfileContent(profile.content, profile.profilePath));
}

function renderFrontmatter(agent: AgentProfile, tools: ToolProfile): string {
  return [
    '---',
    `name: ${agent.name}`,
    `description: "${escapeYaml(agent.description)}"`,
    `color: ${agent.color}`,
    `focus: "${escapeYaml(agent.focus)}"`,
    `tools: [${tools.tools.join(', ')}]`,
    `tools.claude: [${tools.claude.join(', ')}]`,
    `max_turns: ${tools.turns}`,
    `temperature: ${tools.temperature}`,
    `timeout_mins: ${tools.timeout}`,
    `capabilities: ${tools.capability}`,
    '---',
  ].join('\n');
}

function renderExamples(examples: readonly AgentExample[]): string {
  return [
    '<!-- @feature exampleBlocks -->',
    ...examples.map((example) => [
      '<example>',
      `Context: ${example.context}`,
      `user: "${example.user}"`,
      `assistant: "${example.assistant}"`,
      '<commentary>',
      example.commentary,
      '</commentary>',
      '</example>',
    ].join('\n')).flatMap((block, index) => (index === 0 ? [block, ''] : [block])),
    '<!-- @end-feature -->',
  ].join('\n');
}

function renderAgent(agent: AgentProfile, tools: ToolProfile): string {
  return `${renderFrontmatter(agent, tools)}\n${renderExamples(agent.examples)}\n\n${agent.body}`;
}

function listPhysicalAgentSources(srcDir: string): AgentSource[] {
  const dir = path.join(srcDir, 'agents');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => {
      const name = path.basename(entry.name, '.md');
      return {
        name,
        relativePath: path.posix.join('agents', entry.name),
        content: fs.readFileSync(path.join(dir, entry.name), 'utf8'),
        origin: 'physical' as const,
      };
    });
}

function listAgentSources(srcDir: string): AgentSource[] {
  const sources = [
    ...listPhysicalAgentSources(srcDir),
    ...profileFiles(srcDir).flatMap(parseProfileFile),
  ].sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  const names = new Set<string>();
  const paths = new Set<string>();
  for (const source of sources) {
    if (names.has(source.name) || paths.has(source.relativePath)) {
      throw new Error(`Duplicate agent source "${source.name}"`);
    }
    names.add(source.name);
    paths.add(source.relativePath);
  }
  return sources;
}

function listAgentSourcePaths(srcDir: string): string[] {
  return listAgentSources(srcDir).map((source) => source.relativePath);
}

function readAgentSourceContent(srcDir: string, relativePath: string): string {
  if (relativePath.startsWith('agents/') && relativePath.endsWith('.md')) {
    const source = listAgentSources(srcDir).find((entry) => entry.relativePath === relativePath);
    if (source) return source.content;
  }
  return fs.readFileSync(path.join(srcDir, relativePath), 'utf8');
}

export { listAgentSources, listAgentSourcePaths, readAgentSourceContent, renderAgentProfileSources };
export type { AgentSource };
