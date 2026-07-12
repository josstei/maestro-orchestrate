import { emitInlineQuotedList } from '../lib/yaml-emit.js';
import type { EntryPointRegistryEntry } from '../generator/types.js';

function buildGeminiPreamble(entry: EntryPointRegistryEntry): string {
  const resources: string[] = [];
  if (entry.refs && entry.refs.includes('architecture')) {
    resources.push('architecture');
  }
  for (const skill of entry.skills || []) {
    resources.push(skill);
  }

  if (resources.length === 0) {
    return '';
  }

  return `Call \`get_skill_content\` with resources: [${emitInlineQuotedList(resources)}].`;
}

function buildClaudePreamble(entry: EntryPointRegistryEntry): string {
  if (!entry.agents || entry.agents.length === 0) {
    return '';
  }

  return '## Protocol\n\nBefore delegating, call `get_skill_content` with resources: ["delegation"] and follow the returned methodology.\n';
}

function buildCodexPreamble(entry: EntryPointRegistryEntry): string {
  const refs: string[] = [];
  const resources: string[] = [];

  if (entry.refs && entry.refs.includes('architecture')) {
    resources.push('architecture');
  }
  for (const skill of entry.skills || []) {
    resources.push(skill);
  }

  if (resources.length > 0) {
    refs.push(`Call \`get_skill_content\` with resources: [${emitInlineQuotedList(resources)}].`);
  }
  if (entry.agents && entry.agents.length > 0) {
    refs.push(`Call \`get_agent\` with agents: [${emitInlineQuotedList(entry.agents)}].`);
  }

  return refs.join('\n');
}

export { buildGeminiPreamble as gemini, buildClaudePreamble as claude, buildCodexPreamble as codex };
