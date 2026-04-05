module.exports = [
  // lib/ shared files (output to both runtimes)
  { src: 'lib/config/setting-resolver.js', transforms: ['copy'], outputs: { gemini: 'lib/config/setting-resolver.js', claude: 'claude/lib/config/setting-resolver.js' } },
  { src: 'lib/core/agent-registry.js', transforms: ['copy'], outputs: { gemini: 'lib/core/agent-registry.js', claude: 'claude/lib/core/agent-registry.js' } },
  { src: 'lib/core/atomic-write.js', transforms: ['copy'], outputs: { gemini: 'lib/core/atomic-write.js', claude: 'claude/lib/core/atomic-write.js' } },
  { src: 'lib/core/env-file-parser.js', transforms: ['copy'], outputs: { gemini: 'lib/core/env-file-parser.js', claude: 'claude/lib/core/env-file-parser.js' } },
  { src: 'lib/core/logger.js', transforms: ['copy'], outputs: { gemini: 'lib/core/logger.js', claude: 'claude/lib/core/logger.js' } },
  { src: 'lib/core/project-root-resolver.js', transforms: ['copy'], outputs: { gemini: 'lib/core/project-root-resolver.js', claude: 'claude/lib/core/project-root-resolver.js' } },
  { src: 'lib/core/stdin-reader.js', transforms: ['copy'], outputs: { gemini: 'lib/core/stdin-reader.js', claude: 'claude/lib/core/stdin-reader.js' } },
  { src: 'lib/hooks/after-agent-logic.js', transforms: ['copy'], outputs: { gemini: 'lib/hooks/after-agent-logic.js', claude: 'claude/lib/hooks/after-agent-logic.js' } },
  { src: 'lib/hooks/before-agent-logic.js', transforms: ['copy'], outputs: { gemini: 'lib/hooks/before-agent-logic.js', claude: 'claude/lib/hooks/before-agent-logic.js' } },
  { src: 'lib/hooks/hook-state.js', transforms: ['copy'], outputs: { gemini: 'lib/hooks/hook-state.js', claude: 'claude/lib/hooks/hook-state.js' } },
  { src: 'lib/hooks/session-end-logic.js', transforms: ['copy'], outputs: { gemini: 'lib/hooks/session-end-logic.js', claude: 'claude/lib/hooks/session-end-logic.js' } },
  { src: 'lib/hooks/session-start-logic.js', transforms: ['copy'], outputs: { gemini: 'lib/hooks/session-start-logic.js', claude: 'claude/lib/hooks/session-start-logic.js' } },
  { src: 'lib/state/session-id-validator.js', transforms: ['copy'], outputs: { gemini: 'lib/state/session-id-validator.js', claude: 'claude/lib/state/session-id-validator.js' } },
  { src: 'lib/state/session-state.js', transforms: ['copy'], outputs: { gemini: 'lib/state/session-state.js', claude: 'claude/lib/state/session-state.js' } },
  // lib/mcp/ — Gemini only
  { src: 'lib/mcp/handlers/get-skill-content.js', transforms: ['copy'], outputs: { gemini: 'lib/mcp/handlers/get-skill-content.js' } },
  // scripts/ shared files (output to both runtimes)
  { src: 'scripts/ensure-workspace.js', transforms: ['copy'], outputs: { gemini: 'scripts/ensure-workspace.js', claude: 'claude/scripts/ensure-workspace.js' } },
  { src: 'scripts/read-active-session.js', transforms: ['copy'], outputs: { gemini: 'scripts/read-active-session.js', claude: 'claude/scripts/read-active-session.js' } },
  { src: 'scripts/read-setting.js', transforms: ['copy'], outputs: { gemini: 'scripts/read-setting.js', claude: 'claude/scripts/read-setting.js' } },
  { src: 'scripts/read-state.js', transforms: ['copy'], outputs: { gemini: 'scripts/read-state.js', claude: 'claude/scripts/read-state.js' } },
  { src: 'scripts/write-state.js', transforms: ['copy'], outputs: { gemini: 'scripts/write-state.js', claude: 'claude/scripts/write-state.js' } },
  // templates/ shared files (output to both runtimes)
  { src: 'templates/design-document.md', transforms: ['copy'], outputs: { gemini: 'templates/design-document.md', claude: 'claude/templates/design-document.md' } },
  { src: 'templates/implementation-plan.md', transforms: ['copy'], outputs: { gemini: 'templates/implementation-plan.md', claude: 'claude/templates/implementation-plan.md' } },
  { src: 'templates/session-state.md', transforms: ['copy'], outputs: { gemini: 'templates/session-state.md', claude: 'claude/templates/session-state.md' } },
  // references/ shared files (output to both runtimes)
  { src: 'references/orchestration-steps.md', transforms: ['copy'], outputs: { gemini: 'references/orchestration-steps.md', claude: 'claude/references/orchestration-steps.md' } },
  { src: 'references/architecture.md', transforms: ['strip-feature', 'replace-agent-names'], outputs: { gemini: 'references/architecture.md', claude: 'claude/references/architecture.md' } },
];
