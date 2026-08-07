import { ValidationError } from '../../lib/errors/index.js';

export interface NormalizedGetAgentInput {
  agents: string[];
}

export interface NormalizedPlanPhase {
  id: unknown;
  name: string;
  agent: string;
  parallel: boolean;
  blocked_by: unknown[];
  files?: string[];
  [key: string]: unknown;
}

/**
 * Normalizes external get_agent tool calls to canonical { agents: string[] }.
 *
 * Accepts:
 * - { agents: ["coder"] } (canonical)
 * - { agents: "coder" } (scalar compatibility form)
 * - { agent: "coder" } (singular alias compatibility form)
 *
 * Rejects:
 * - missing fields (neither agents nor agent)
 * - ambiguous fields (both agents and agent)
 * - empty strings or whitespace-only strings
 * - empty arrays
 * - arrays containing non-string entries
 */
export function normalizeGetAgentInput(params: unknown): NormalizedGetAgentInput {
  if (!params || typeof params !== 'object') {
    throw new ValidationError('Missing get_agent input payload', {
      code: 'MISSING_AGENT_INPUT',
      details: { tool: 'get_agent', field: 'agents' },
    });
  }

  const record = params as Record<string, unknown>;
  const hasAgents = Object.prototype.hasOwnProperty.call(record, 'agents') && record.agents !== undefined;
  const hasAgent = Object.prototype.hasOwnProperty.call(record, 'agent') && record.agent !== undefined;

  if (hasAgents && hasAgent) {
    throw new ValidationError('Ambiguous get_agent input: both "agents" and "agent" were provided', {
      code: 'AMBIGUOUS_AGENT_INPUT',
      details: { tool: 'get_agent', canonicalField: 'agents', aliasField: 'agent' },
    });
  }

  if (!hasAgents && !hasAgent) {
    throw new ValidationError('Missing agent input for get_agent: expected "agents" or "agent"', {
      code: 'MISSING_AGENT_INPUT',
      details: { tool: 'get_agent', field: 'agents' },
    });
  }

  const rawValue = hasAgents ? record.agents : record.agent;

  if (Array.isArray(rawValue)) {
    if (rawValue.length === 0) {
      throw new ValidationError('Invalid get_agent input: "agents" array must not be empty', {
        code: 'INVALID_AGENT_INPUT',
        details: { tool: 'get_agent', field: 'agents', receivedKind: 'empty_array' },
      });
    }

    const trimmedAgents: string[] = [];
    for (const item of rawValue) {
      if (typeof item !== 'string') {
        throw new ValidationError('Invalid get_agent input: array items must be non-empty strings', {
          code: 'INVALID_AGENT_INPUT',
          details: { tool: 'get_agent', field: 'agents', receivedKind: typeof item },
        });
      }
      const trimmed = item.trim();
      if (trimmed.length === 0) {
        throw new ValidationError('Invalid get_agent input: agent identifier must not be empty or whitespace', {
          code: 'INVALID_AGENT_INPUT',
          details: { tool: 'get_agent', field: 'agents', receivedKind: 'whitespace_string' },
        });
      }
      trimmedAgents.push(trimmed);
    }
    return { agents: trimmedAgents };
  }

  if (typeof rawValue === 'string') {
    const trimmed = rawValue.trim();
    if (trimmed.length === 0) {
      throw new ValidationError('Invalid get_agent input: agent identifier must not be empty or whitespace', {
        code: 'INVALID_AGENT_INPUT',
        details: { tool: 'get_agent', field: hasAgents ? 'agents' : 'agent', receivedKind: 'whitespace_string' },
      });
    }
    return { agents: [trimmed] };
  }

  throw new ValidationError(`Invalid get_agent input: expected string or array of strings, received ${typeof rawValue}`, {
    code: 'INVALID_AGENT_INPUT',
    details: { tool: 'get_agent', field: hasAgents ? 'agents' : 'agent', receivedKind: typeof rawValue },
  });
}

/**
 * Normalizes plan-phase input to canonical single-agent phase shape { agent: string, ... }.
 *
 * Accepts:
 * - { agent: "coder", ... } (canonical)
 * - { agents: ["coder"], ... } (single-entry compatibility alias)
 *
 * Rejects:
 * - missing fields (neither agent nor agents)
 * - ambiguous fields (both agent and agents present)
 * - empty arrays or arrays with != 1 entry
 * - empty strings or whitespace-only strings
 * - non-string items or array assigned to singular agent
 */
export function normalizePlanPhaseAgentInput(phase: unknown): NormalizedPlanPhase {
  if (!phase || typeof phase !== 'object') {
    throw new ValidationError('Invalid plan phase: expected object', {
      code: 'INVALID_AGENT_INPUT',
      details: { field: 'phase', receivedKind: typeof phase },
    });
  }

  const record = phase as Record<string, unknown>;
  const hasAgent = Object.prototype.hasOwnProperty.call(record, 'agent') && record.agent !== undefined;
  const hasAgents = Object.prototype.hasOwnProperty.call(record, 'agents') && record.agents !== undefined;

  if (hasAgent && hasAgents) {
    throw new ValidationError('Ambiguous plan phase agent input: both "agent" and "agents" were provided', {
      code: 'AMBIGUOUS_AGENT_INPUT',
      details: { canonicalField: 'agent', aliasField: 'agents' },
    });
  }

  if (!hasAgent && !hasAgents) {
    throw new ValidationError('Missing plan phase agent input: expected "agent" or "agents"', {
      code: 'MISSING_AGENT_INPUT',
      details: { field: 'agent' },
    });
  }

  const rest: Record<string, unknown> = {};
  for (const key of Object.keys(record)) {
    if (key !== 'agent' && key !== 'agents') {
      rest[key] = record[key];
    }
  }

  if (hasAgent) {
    const rawAgent = record.agent;
    if (Array.isArray(rawAgent)) {
      throw new ValidationError('Invalid plan phase agent: singular "agent" must not be an array', {
        code: 'INVALID_AGENT_INPUT',
        details: { field: 'agent', receivedKind: 'array' },
      });
    }
    if (typeof rawAgent !== 'string') {
      throw new ValidationError(`Invalid plan phase agent: expected string, received ${typeof rawAgent}`, {
        code: 'INVALID_AGENT_INPUT',
        details: { field: 'agent', receivedKind: typeof rawAgent },
      });
    }
    const trimmed = rawAgent.trim();
    if (trimmed.length === 0) {
      throw new ValidationError('Invalid plan phase agent: agent identifier must not be empty or whitespace', {
        code: 'INVALID_AGENT_INPUT',
        details: { field: 'agent', receivedKind: 'whitespace_string' },
      });
    }
    return { ...rest, agent: trimmed } as NormalizedPlanPhase;
  }

  // hasAgents
  const rawAgents = record.agents;
  if (!Array.isArray(rawAgents)) {
    throw new ValidationError(`Invalid plan phase "agents" alias: expected array, received ${typeof rawAgents}`, {
      code: 'INVALID_AGENT_INPUT',
      details: { field: 'agents', receivedKind: typeof rawAgents },
    });
  }

  if (rawAgents.length !== 1) {
    throw new ValidationError(`Invalid plan phase "agents" alias: expected exactly 1 agent, received ${rawAgents.length}`, {
      code: 'INVALID_AGENT_CARDINALITY',
      details: { field: 'agents', expectedCardinality: 1, receivedCount: rawAgents.length },
    });
  }

  const singleAgent = rawAgents[0];
  if (typeof singleAgent !== 'string') {
    throw new ValidationError(`Invalid plan phase agent item: expected string, received ${typeof singleAgent}`, {
      code: 'INVALID_AGENT_INPUT',
      details: { field: 'agents', receivedKind: typeof singleAgent },
    });
  }

  const trimmed = singleAgent.trim();
  if (trimmed.length === 0) {
    throw new ValidationError('Invalid plan phase agent item: must not be empty or whitespace', {
      code: 'INVALID_AGENT_INPUT',
      details: { field: 'agents', receivedKind: 'whitespace_string' },
    });
  }

  return { ...rest, agent: trimmed } as NormalizedPlanPhase;
}
