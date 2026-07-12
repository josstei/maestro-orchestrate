import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { repoPath } from '../support/paths.js';

const SKILL = repoPath('src/skills/shared/validation/SKILL.md');

test('validation skill consults get_project_profile before the heuristic tables', () => {
  const body = fs.readFileSync(SKILL, 'utf8');
  assert.ok(
    body.includes('get_project_profile'),
    'validation skill must reference get_project_profile'
  );
  const profileIdx = body.indexOf('get_project_profile');
  const buildStepIdx = body.indexOf('### Step 1: Build / Compile');
  assert.ok(buildStepIdx >= 0, 'validation skill must retain the Build/Compile heuristic step');
  assert.ok(
    profileIdx < buildStepIdx,
    'get_project_profile consultation must precede the heuristic tables'
  );
});
