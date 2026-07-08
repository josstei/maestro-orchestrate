import path from 'path';
import { ValidationError } from '../../lib/errors/index.js';
import { atomicWriteSync, readFileSafe } from '../../lib/io/index.js';
import { assertRelativePath } from '../../lib/validation/index.js';
import { resolveStateDirPath } from '../../state/session-state.js';
function assertAgentMemorySegment(agent) {
    if (typeof agent !== 'string' || agent.length === 0) {
        throw new ValidationError('agent must be a non-empty filesystem segment');
    }
    assertRelativePath(agent);
    if (agent.includes('/') ||
        agent.includes('\\') ||
        agent === '.' ||
        agent === '..') {
        throw new ValidationError('agent must be a single filesystem segment', {
            details: { value: agent },
        });
    }
    return agent;
}
function agentMemoryPath(projectRoot, agent) {
    const segment = assertAgentMemorySegment(agent);
    return path.join(resolveStateDirPath(projectRoot), 'knowledge', 'agent-memory', `${segment}.md`);
}
function readAgentMemory(projectRoot, agent) {
    return readFileSafe(agentMemoryPath(projectRoot, agent), '');
}
function appendAgentMemory(projectRoot, agent, note) {
    if (typeof note !== 'string' || note.length === 0) {
        throw new ValidationError('note must be a non-empty string');
    }
    const filePath = agentMemoryPath(projectRoot, agent);
    const line = note.endsWith('\n') ? note : `${note}\n`;
    atomicWriteSync(filePath, `${readFileSafe(filePath, '')}${line}`);
    return line;
}
export { appendAgentMemory, readAgentMemory, };
