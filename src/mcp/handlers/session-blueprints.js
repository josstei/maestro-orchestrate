'use strict';

const fs = require('node:fs');
const path = require('node:path');

const markdownState = require('../../core/markdown-state');
const { NotFoundError, ValidationError } = require('../../lib/errors');

const BLUEPRINT_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const BLUEPRINT_DIR = path.join(__dirname, '..', '..', 'templates', 'session-blueprints');

/**
 * Resolve an authored session blueprint file from the installed package payload.
 *
 * @param {string} blueprintId - Authored blueprint identifier.
 * @returns {string} Absolute blueprint markdown path.
 * @throws {NotFoundError} When the id is invalid or no blueprint exists.
 */
function resolveBlueprintPath(blueprintId) {
  if (typeof blueprintId !== 'string' || !BLUEPRINT_ID_PATTERN.test(blueprintId)) {
    throw new NotFoundError(`Session blueprint '${blueprintId}' not found`);
  }

  const filePath = path.join(BLUEPRINT_DIR, `${blueprintId}.md`);
  if (!fs.existsSync(filePath)) {
    throw new NotFoundError(`Session blueprint '${blueprintId}' not found`);
  }

  return filePath;
}

/**
 * Parse a blueprint markdown file with structured JSON frontmatter.
 *
 * @param {string} filePath - Absolute markdown file path.
 * @returns {object} Parsed blueprint frontmatter.
 * @throws {ValidationError} When the blueprint is malformed.
 */
function parseBlueprint(filePath) {
  try {
    return markdownState.parse(fs.readFileSync(filePath, 'utf8')).data;
  } catch (err) {
    throw new ValidationError(`Invalid session blueprint: ${path.basename(filePath)}`, {
      details: { file: filePath, message: err.message },
    });
  }
}

/**
 * Normalize an authored phase into the exact create_session phase item shape.
 *
 * @param {object} phase - Authored phase descriptor.
 * @param {number} index - Zero-based phase index.
 * @returns {{ id: number, name: string, agent: string, parallel: boolean, blocked_by: Array<number|string> }}
 * @throws {ValidationError} When required phase fields are malformed.
 */
function instantiatePhase(phase, index) {
  const id = index + 1;
  if (!phase || typeof phase.name !== 'string' || phase.name.trim() === '') {
    throw new ValidationError(`Session blueprint phase ${id} must define a non-empty name`);
  }
  if (typeof phase.agent !== 'string' || phase.agent.trim() === '') {
    throw new ValidationError(`Session blueprint phase ${id} must define a non-empty agent`);
  }
  if (phase.blocked_by !== undefined && !Array.isArray(phase.blocked_by)) {
    throw new ValidationError(`Session blueprint phase ${id} blocked_by must be an array`);
  }

  return {
    id,
    name: phase.name,
    agent: phase.agent,
    parallel: phase.parallel === true,
    blocked_by: phase.blocked_by || [],
  };
}

/**
 * Read and parse all authored session blueprints in deterministic order.
 *
 * @returns {object[]} Parsed blueprint frontmatter objects.
 */
function readBlueprints() {
  return fs
    .readdirSync(BLUEPRINT_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => parseBlueprint(path.join(BLUEPRINT_DIR, entry.name)))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

/**
 * List available session blueprints.
 *
 * @returns {{ blueprints: Array<{ id: string, title: string }> }}
 */
function handleListSessionBlueprints() {
  return {
    blueprints: readBlueprints().map((blueprint) => ({
      id: blueprint.id,
      title: blueprint.title,
    })),
  };
}

/**
 * Instantiate a session blueprint into create_session-compatible phases.
 *
 * @param {{ blueprint_id: string, task: string }} params - Blueprint id and concrete task.
 * @returns {{ task: string, phases: Array<object>, design_outline: string }}
 * @throws {NotFoundError} When the blueprint id is unknown.
 * @throws {ValidationError} When the blueprint is malformed.
 */
function handleInstantiateSessionBlueprint(params) {
  const blueprint = parseBlueprint(resolveBlueprintPath(params.blueprint_id));

  if (!Array.isArray(blueprint.phases) || blueprint.phases.length === 0) {
    throw new ValidationError(`Session blueprint '${params.blueprint_id}' must define phases`);
  }

  return {
    task: params.task,
    phases: blueprint.phases.map(instantiatePhase),
    design_outline: blueprint.design_outline || '',
  };
}

module.exports = {
  handleInstantiateSessionBlueprint,
  handleListSessionBlueprints,
};
