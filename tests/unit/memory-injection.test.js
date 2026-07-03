'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

describe('orchestration-steps memory injection', () => {
  const steps = read('src/references/orchestration-steps.md');

  it('recalls the project profile and similar sessions before the design dialogue', () => {
    assert.match(steps, /get_project_profile/);
    assert.match(steps, /recall_similar_sessions/);
  });

  it('gates the recall on MAESTRO_MEMORY_INJECTION', () => {
    assert.match(steps, /MAESTRO_MEMORY_INJECTION/);
  });

  it('injects prior memory as overridable recommended defaults', () => {
    assert.match(steps, /overridable/i);
    assert.match(steps, /do-not-touch/i);
    assert.match(steps, /warnings/i);
  });
});

describe('design-dialogue memory injection', () => {
  const skill = read('src/skills/shared/design-dialogue/SKILL.md');

  it('consumes the recalled project profile and similar sessions', () => {
    assert.match(skill, /get_project_profile/);
    assert.match(skill, /recall_similar_sessions/);
  });

  it('gates injection on MAESTRO_MEMORY_INJECTION and keeps defaults overridable', () => {
    assert.match(skill, /MAESTRO_MEMORY_INJECTION/);
    assert.match(skill, /overridable/i);
    assert.match(skill, /do-not-touch/i);
    assert.match(skill, /warnings/i);
  });
});

describe('implementation-planning memory injection', () => {
  const skill = read('src/skills/shared/implementation-planning/SKILL.md');

  it('consumes the recalled project profile and similar sessions', () => {
    assert.match(skill, /get_project_profile/);
    assert.match(skill, /recall_similar_sessions/);
  });

  it('gates injection on MAESTRO_MEMORY_INJECTION and keeps defaults overridable', () => {
    assert.match(skill, /MAESTRO_MEMORY_INJECTION/);
    assert.match(skill, /overridable/i);
    assert.match(skill, /do-not-touch/i);
    assert.match(skill, /warnings/i);
  });
});
