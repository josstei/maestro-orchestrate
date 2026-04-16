const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const config = require('../../src/references/orchestration-steps.config');
const {
  buildStepIndex,
  renderSteps,
  validateConfig,
} = require('../../src/references/orchestration-steps-renderer');

describe('orchestration-steps config', () => {
  it('passes structural validation with zero errors', () => {
    const { errors } = validateConfig(config);
    assert.deepEqual(errors, [], `Validation errors:\n${errors.join('\n')}`);
  });

  it('contains exactly 41 numbered steps', () => {
    const index = buildStepIndex(config);
    assert.equal(index.size, 41, `Expected 41 steps, got ${index.size}`);
  });

  it('assigns sequential numbers starting from 0', () => {
    const index = buildStepIndex(config);
    const numbers = [...index.values()].sort((a, b) => a - b);
    for (let i = 0; i < numbers.length; i++) {
      assert.equal(numbers[i], i, `Expected step number ${i}, got ${numbers[i]}`);
    }
  });

  it('has unique step IDs across all sections', () => {
    const ids = [];
    for (const section of config) {
      if (section.type === 'phase') {
        for (const step of section.steps) {
          ids.push(step.id);
        }
      }
    }
    const unique = new Set(ids);
    assert.equal(unique.size, ids.length, `Duplicate IDs: ${ids.filter((id, i) => ids.indexOf(id) !== i)}`);
  });

  it('resolves all {@ref} cross-references to existing step IDs', () => {
    const index = buildStepIndex(config);
    const refPattern = /\{@([a-z][a-z0-9-]*)\}/g;
    const unresolved = [];

    for (const section of config) {
      const texts = [section.label];
      if (section.type === 'phase') {
        if (section.preamble) texts.push(section.preamble);
        for (const step of section.steps) {
          texts.push(step.action);
          if (step.hardGate) texts.push(step.hardGate);
          if (step.antiPattern) texts.push(step.antiPattern);
        }
      } else if (section.content) {
        texts.push(section.content);
      }

      for (const text of texts) {
        let match;
        while ((match = refPattern.exec(text)) !== null) {
          if (!index.has(match[1])) {
            unresolved.push(match[0]);
          }
        }
      }
    }

    assert.deepEqual(unresolved, [], `Unresolved references: ${unresolved.join(', ')}`);
  });

  it('has correct section types', () => {
    for (const section of config) {
      assert.ok(
        section.type === 'phase' || section.type === 'block',
        `Unknown section type "${section.type}" in "${section.id}"`
      );
    }
  });

  it('every phase has a non-empty steps array', () => {
    for (const section of config) {
      if (section.type === 'phase') {
        assert.ok(
          Array.isArray(section.steps) && section.steps.length > 0,
          `Phase "${section.id}" has no steps`
        );
      }
    }
  });

  it('every block has a content string', () => {
    for (const section of config) {
      if (section.type === 'block') {
        assert.equal(typeof section.content, 'string', `Block "${section.id}" missing content`);
      }
    }
  });
});

describe('orchestration-steps renderer', () => {
  it('renders without throwing', () => {
    assert.doesNotThrow(() => renderSteps(config));
  });

  it('contains no unresolved {@ref} tokens in rendered output', () => {
    const rendered = renderSteps(config);
    const unresolvedRefs = rendered.match(/\{@[a-z][a-z0-9-]*\}/g);
    assert.equal(unresolvedRefs, null, `Unresolved refs in output: ${unresolvedRefs}`);
  });

  it('preserves HARD-GATE blocks in output', () => {
    const rendered = renderSteps(config);
    const openTags = (rendered.match(/<HARD-GATE>/g) || []).length;
    const closeTags = (rendered.match(/<\/HARD-GATE>/g) || []).length;
    assert.equal(openTags, closeTags, 'Mismatched HARD-GATE tags');
    assert.equal(openTags, 13, `Expected 13 HARD-GATE blocks, got ${openTags}`);
  });

  it('preserves ANTI-PATTERN blocks in output', () => {
    const rendered = renderSteps(config);
    const openTags = (rendered.match(/<ANTI-PATTERN>/g) || []).length;
    const closeTags = (rendered.match(/<\/ANTI-PATTERN>/g) || []).length;
    assert.equal(openTags, closeTags, 'Mismatched ANTI-PATTERN tags');
    assert.equal(openTags, 1, `Expected 1 ANTI-PATTERN block, got ${openTags}`);
  });

  it('numbers the first step as 0 and the last as 40', () => {
    const rendered = renderSteps(config);
    assert.ok(rendered.includes(' 0. '), 'First step should be numbered 0');
    assert.ok(rendered.includes('40. '), 'Last step should be numbered 40');
  });
});
