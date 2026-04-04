#!/usr/bin/env bash
set -euo pipefail

echo "Checking shared lib/ drift between root and claude/..."

# Check all mirrored lib files except the 2 with intentional env var patches.
# Claude intentionally does not mirror Gemini-only lib/mcp/.
diff -rq lib/ claude/lib/ \
  --exclude=mcp \
  --exclude=setting-resolver.js \
  --exclude=project-root-resolver.js \
  || { echo "DRIFT DETECTED: lib/ and claude/lib/ have diverged (excluding patched files)"; exit 1; }

if [ ! -d lib/mcp ]; then
  echo "DRIFT: expected Gemini-only lib/mcp/ directory is missing"
  exit 1
fi

if [ -d claude/lib/mcp ]; then
  echo "DRIFT: claude/lib/mcp/ should not exist; Claude reads plugin resources directly"
  exit 1
fi

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
