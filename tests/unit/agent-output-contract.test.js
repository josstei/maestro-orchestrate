import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { listAgentSources } from '../../dist/src/core/agent-sources.js';
import { repoPath } from '../support/paths.js';

describe('canonical agent output contract', () => {
  it('keeps the full handoff template in the shared agent base protocol', () => {
    const protocol = fs.readFileSync(
      repoPath(
        'src',
        'skills',
        'shared',
        'delegation',
        'protocols',
        'agent-base-protocol.md'
      ),
      'utf8'
    );

    assert.match(protocol, /## Task Report/);
    assert.match(protocol, /## Downstream Context/);
    assert.match(protocol, /\*\*Files Created\*\*/);
    assert.match(protocol, /\*\*Key Interfaces Introduced\*\*/);
  });

  it('keeps canonical agents free of the redundant output-contract pointer and the full template', () => {
    const sources = listAgentSources(repoPath('src'));
    assert.ok(sources.length > 30, 'expected canonical agent catalog');

    for (const source of sources) {
      assert.doesNotMatch(
        source.content,
        /^## Output Contract$/m,
        `${source.relativePath} must not carry the redundant per-agent output-contract pointer; the injected agent-base-protocol owns the handoff contract`
      );
      assert.doesNotMatch(
        source.content,
        /^## Task Report$/m,
        `${source.relativePath} must not duplicate the full Task Report template`
      );
      assert.doesNotMatch(
        source.content,
        /^## Downstream Context$/m,
        `${source.relativePath} must not duplicate the full Downstream Context template`
      );
    }
  });
});
