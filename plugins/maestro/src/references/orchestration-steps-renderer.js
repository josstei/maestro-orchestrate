'use strict';

const REF_PATTERN = /\{@([a-z][a-z0-9-]*)\}/g;

/**
 * Assign sequential step numbers across all phase sections.
 * @param {Array} config - The orchestration steps config
 * @returns {Map<string, number>} Map of step ID to assigned number
 */
function buildStepIndex(config) {
  const index = new Map();
  let counter = 0;

  for (const section of config) {
    if (section.type !== 'phase' || !Array.isArray(section.steps)) {
      continue;
    }
    for (const step of section.steps) {
      if (index.has(step.id)) {
        throw new Error(`Duplicate step ID: "${step.id}"`);
      }
      index.set(step.id, counter);
      counter++;
    }
  }

  return index;
}

/**
 * Replace all {@step-id} tokens in text with their resolved step numbers.
 * @param {string} text - Text containing {@id} tokens
 * @param {Map<string, number>} index - Step ID to number map
 * @returns {string} Text with resolved references
 */
function resolveRefs(text, index) {
  return text.replace(REF_PATTERN, (_match, id) => {
    if (!index.has(id)) {
      throw new Error(`Unresolved step reference: "{@${id}}"`);
    }
    return String(index.get(id));
  });
}

/**
 * Render a HARD-GATE block with proper indentation.
 * @param {string} content - Gate content
 * @returns {string}
 */
function renderHardGate(content) {
  const lines = content.split('\n');
  const indented = lines.map((line) => '    ' + line).join('\n');
  return '    <HARD-GATE>\n' + indented + '\n    </HARD-GATE>';
}

/**
 * Render an ANTI-PATTERN block with proper indentation.
 * @param {string} content - Anti-pattern content
 * @returns {string}
 */
function renderAntiPattern(content) {
  const lines = content.split('\n');
  const indented = lines.map((line) => '    ' + line).join('\n');
  return '    <ANTI-PATTERN>\n' + indented + '\n    </ANTI-PATTERN>';
}

/**
 * Render a single numbered step with optional HARD-GATE and ANTI-PATTERN.
 * @param {number} number - Step number
 * @param {object} step - Step definition
 * @returns {string}
 */
function renderStep(number, step) {
  const parts = [];
  const prefix = String(number).padStart(2, ' ');
  parts.push(`${prefix}. ${step.action}`);

  if (step.hardGate) {
    parts.push(renderHardGate(step.hardGate));
  }

  if (step.antiPattern) {
    parts.push(renderAntiPattern(step.antiPattern));
  }

  return parts.join('\n');
}

/**
 * Render the full orchestration steps config to markdown.
 * @param {Array} config - The orchestration steps config
 * @returns {string} Rendered markdown
 */
function renderSteps(config) {
  const index = buildStepIndex(config);
  const sections = [];

  let stepCounter = 0;

  for (const section of config) {
    const lines = [];

    // Resolve refs in the label
    const label = resolveRefs(section.label, index);
    lines.push(label);

    if (section.type === 'phase') {
      if (section.preamble) {
        lines.push('');
        lines.push(resolveRefs(section.preamble, index));
        lines.push('');
      }

      for (const step of section.steps) {
        lines.push(renderStep(stepCounter, step));
        stepCounter++;
      }
    } else if (section.type === 'block') {
      lines.push(section.content);
    }

    sections.push(lines.join('\n'));
  }

  // Join sections with blank lines, resolve all remaining refs, ensure trailing newline
  const raw = sections.join('\n\n');
  return resolveRefs(raw, index) + '\n';
}

/**
 * Validate the config structure and references.
 * @param {Array} config - The orchestration steps config
 * @returns {{ errors: string[] }}
 */
function validateConfig(config) {
  const errors = [];

  if (!Array.isArray(config)) {
    return { errors: ['Config must be an array'] };
  }

  // Collect all step IDs
  const allIds = new Set();
  const duplicates = new Set();

  for (const section of config) {
    if (!section.type || !section.id || !section.label) {
      errors.push(`Section missing required fields (type, id, label): ${JSON.stringify(section).slice(0, 80)}`);
      continue;
    }

    if (section.type === 'phase') {
      if (!Array.isArray(section.steps) || section.steps.length === 0) {
        errors.push(`Phase "${section.id}" must have a non-empty steps array`);
        continue;
      }

      for (const step of section.steps) {
        if (!step.id || !step.action) {
          errors.push(`Step in phase "${section.id}" missing required fields (id, action)`);
          continue;
        }

        if (allIds.has(step.id)) {
          duplicates.add(step.id);
        }
        allIds.add(step.id);
      }
    } else if (section.type === 'block') {
      if (typeof section.content !== 'string') {
        errors.push(`Block "${section.id}" must have a content string`);
      }
    } else {
      errors.push(`Unknown section type "${section.type}" in section "${section.id}"`);
    }
  }

  for (const id of duplicates) {
    errors.push(`Duplicate step ID: "${id}"`);
  }

  // Check all {@ref} tokens resolve
  const refTexts = [];
  for (const section of config) {
    if (section.label) refTexts.push(section.label);
    if (section.type === 'phase') {
      if (section.preamble) refTexts.push(section.preamble);
      for (const step of section.steps || []) {
        if (step.action) refTexts.push(step.action);
        if (step.hardGate) refTexts.push(step.hardGate);
        if (step.antiPattern) refTexts.push(step.antiPattern);
      }
    } else if (section.type === 'block' && section.content) {
      refTexts.push(section.content);
    }
  }

  const allText = refTexts.join('\n');
  let match;
  const refRegex = /\{@([a-z][a-z0-9-]*)\}/g;
  while ((match = refRegex.exec(allText)) !== null) {
    if (!allIds.has(match[1])) {
      errors.push(`Unresolved reference "{@${match[1]}}"`);
    }
  }

  return { errors };
}

module.exports = {
  buildStepIndex,
  resolveRefs,
  renderSteps,
  validateConfig,
};
