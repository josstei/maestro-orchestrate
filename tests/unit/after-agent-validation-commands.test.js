import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { repoPath } from '../support/paths.js';

const hooksDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-hooks-vc-'));
process.env.MAESTRO_HOOKS_DIR = hooksDir;

const { default: hookState } = await import('../../dist/src/hooks/logic/hook-state.js');
const { handleAfterAgent, extractValidationCommands } = await import('../../dist/src/hooks/logic/after-agent-logic.js');
const SESSION_ID = 'vc-session-xyz';

describe('extractValidationCommands', () => {
  it('parses categorized commands from a Validation Commands section', () => {
    const report = [
      '## Task Report',
      '- **Status**: success',
      '',
      '## Validation Commands',
      '- build: `npm run build`',
      '- test: npm test',
      '- lint: `npm run lint`',
      '',
      '## Downstream Context',
      '- **Warnings**: none',
    ].join('\n');
    assert.deepEqual(extractValidationCommands(report), {
      build: ['npm run build'],
      test: ['npm test'],
      lint: ['npm run lint'],
    });
  });

  it('returns empty categories when the section is absent', () => {
    assert.deepEqual(
      extractValidationCommands('## Task Report\nDone.\n\n## Downstream Context\nnone'),
      { build: [], test: [], lint: [] }
    );
  });

  it('tolerates non-string input', () => {
    assert.deepEqual(extractValidationCommands(null), { build: [], test: [], lint: [] });
  });
});

describe('handleAfterAgent surfaces validation_commands', () => {
  after(() => {
    hookState.removeSessionDir(SESSION_ID);
  });

  it('attaches parsed commands to an allow decision without blocking', () => {
    hookState.ensureSessionDir(SESSION_ID);
    hookState.setActiveAgent(SESSION_ID, 'coder');
    const result = handleAfterAgent({
      sessionId: SESSION_ID,
      agentResult:
        '## Task Report\nDone.\n\n## Validation Commands\n- test: npm test\n\n## Downstream Context\nInfo.',
      stopHookActive: false,
    });
    assert.equal(result.action, 'allow');
    assert.deepEqual(result.validation_commands, {
      build: [],
      test: ['npm test'],
      lint: [],
    });
  });
});

describe('capture trigger is authored into the protocol and steps', () => {
  it('agent-base-protocol documents the Validation Commands handoff section', () => {
    const body = fs.readFileSync(
      repoPath('src/skills/shared/delegation/protocols/agent-base-protocol.md'),
      'utf8'
    );
    assert.ok(body.includes('## Validation Commands'));
    assert.ok(body.includes('record_validation_commands'));
  });

  it('orchestration-steps invokes record_validation_commands in the execution loop', () => {
    const body = fs.readFileSync(
      repoPath('src/references/orchestration-steps.md'),
      'utf8'
    );
    assert.ok(body.includes('record_validation_commands'));
  });
});
