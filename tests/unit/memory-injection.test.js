import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { repoPath } from '../support/paths.js';

const read = (rel) => fs.readFileSync(repoPath(rel), 'utf8');

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

  it('consults plan accuracy before finalizing phase file manifests', () => {
    assert.match(skill, /get_plan_accuracy/);
    assert.match(skill, /Before finalizing the plan/);
    assert.match(skill, /precision/);
    assert.match(skill, /recall/);
  });
});

describe('delegation agent memory injection', () => {
  const skill = read('src/skills/shared/delegation/SKILL.md');

  it('loads per-agent memory before constructing the delegation prompt', () => {
    assert.match(skill, /get_agent_memory/);
    assert.match(skill, /target agent/i);
    assert.match(skill, /delegation prompt/i);
  });
});
