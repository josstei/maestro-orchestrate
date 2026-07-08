import path from 'path';
import { ValidationError } from '../../lib/errors/index.js';
import { atomicWriteSync, readFileSafe } from '../../lib/io/index.js';
import { assertRelativePath } from '../../lib/validation/index.js';
import { resolveStateDirPath } from '../../state/session-state.js';

function assertAgentMemorySegment(agent: any) {
  if (typeof agent !== 'string' || agent.length === 0) {
    throw new ValidationError('agent must be a non-empty filesystem segment');
  }
  assertRelativePath(agent);
  if (
    agent.includes('/') ||
    agent.includes('\\') ||
    agent === '.' ||
    agent === '..'
  ) {
    throw new ValidationError('agent must be a single filesystem segment', {
      details: { value: agent },
    });
  }
  return agent;
}

function agentMemoryPath(projectRoot: any, agent: any) {
  const segment = assertAgentMemorySegment(agent);
  return path.join(
    resolveStateDirPath(projectRoot),
    'knowledge',
    'agent-memory',
    `${segment}.md`
  );
}

function readAgentMemory(projectRoot: any, agent: any) {
  return readFileSafe(agentMemoryPath(projectRoot, agent), '');
}

function appendAgentMemory(projectRoot: any, agent: any, note: any) {
  if (typeof note !== 'string' || note.length === 0) {
    throw new ValidationError('note must be a non-empty string');
  }
  const filePath = agentMemoryPath(projectRoot, agent);
  const line = note.endsWith('\n') ? note : `${note}\n`;
  atomicWriteSync(filePath, `${readFileSafe(filePath, '')}${line}`);
  return line;
}

export {
  appendAgentMemory,
  readAgentMemory,
};
