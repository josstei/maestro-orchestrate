'use strict';

/**
 * Transform: extract-examples
 *
 * For Claude runtime, extracts <example>...</example> blocks from the body
 * and stores them in the shared pipeline state. Other runtimes pass through
 * unchanged.
 *
 * @param {string} content  - Full agent file (pass-through)
 * @param {object} runtime  - Runtime config
 * @param {object} options  - Pipeline options with shared state
 * @returns {string} Content passed through unchanged
 */
function extractExamplesTransform(content, runtime, options) {
  if (runtime.name !== 'claude') return content;

  const { examples, remaining } = extractExamples(options.state.body);
  options.state.body = remaining;
  options.state.examples = examples;
  return content;
}

/**
 * Extract <example>...</example> blocks from body text.
 * @param {string} body - Body text to extract examples from
 * @returns {{ examples: string[], remaining: string }}
 */
function extractExamples(body) {
  const examples = [];
  const lines = body.split('\n');
  const remainingLines = [];
  let inExample = false;
  let currentExample = [];

  for (const line of lines) {
    if (line.trim() === '<example>') {
      inExample = true;
      currentExample = ['<example>'];
    } else if (line.trim() === '</example>') {
      inExample = false;
      currentExample.push('</example>');
      examples.push(currentExample.join('\n'));
      currentExample = [];
    } else if (inExample) {
      currentExample.push(line);
    } else {
      remainingLines.push(line);
    }
  }

  if (inExample) {
    throw new Error('Unclosed <example> tag in agent body');
  }

  let remaining = remainingLines.join('\n');
  remaining = remaining.replace(/\n{3,}/g, '\n\n');
  remaining = remaining.replace(/^\n{2,}/, '\n');

  return { examples, remaining };
}

module.exports = extractExamplesTransform;
