#!/usr/bin/env bash
set -euo pipefail

echo "Checking shared lib/ drift between root and claude/..."

# Check all lib files except the 2 with intentional env var patches
# (diff --exclude matches by basename, which is fine since these names are unique in lib/)
diff -rq lib/ claude/lib/ \
  --exclude=setting-resolver.js \
  --exclude=project-root-resolver.js \
  || { echo "DRIFT DETECTED: lib/ and claude/lib/ have diverged (excluding patched files)"; exit 1; }

# Verify patched files contain both Gemini and Claude env var references
grep -q "MAESTRO_EXTENSION_PATH" claude/lib/config/setting-resolver.js \
  && grep -q "CLAUDE_PLUGIN_ROOT" claude/lib/config/setting-resolver.js \
  || { echo "DRIFT: claude/lib/config/setting-resolver.js missing expected env vars"; exit 1; }

grep -q "MAESTRO_WORKSPACE_PATH" claude/lib/core/project-root-resolver.js \
  && grep -q "CLAUDE_PROJECT_DIR" claude/lib/core/project-root-resolver.js \
  || { echo "DRIFT: claude/lib/core/project-root-resolver.js missing expected env vars"; exit 1; }

# NOTE: templates/, references/, and README.md are intentionally different
# between runtimes (Claude uses kebab-case agent names and ${CLAUDE_PLUGIN_ROOT}).
# Do NOT diff these — they are runtime-specific content, not shared copies.

echo "All drift checks passed."
