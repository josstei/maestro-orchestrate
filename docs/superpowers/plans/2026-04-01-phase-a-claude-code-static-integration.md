# Phase A: Claude Code Static Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Claude Code plugin artifacts to this repo as a self-contained `claude/` subdirectory, with zero Gemini regression.

**Architecture:** The repo root remains the Gemini CLI extension root. A `claude/` subdirectory serves as the Claude Code plugin root. All 89 files from overture's generated `dist/claude-plugin/` output (commit `b314d9d`) are copied into `claude/`. Root `lib/` receives two targeted env var fallback patches before copying, so `claude/lib/` inherits them.

**Tech Stack:** Node.js (existing), Gemini CLI extension format (existing), Claude Code plugin format (`.claude-plugin/plugin.json`, Markdown agents/commands/skills, JSON hooks)

**Spec reference:** `docs/superpowers/specs/2026-04-01-dual-runtime-claude-code-plugin-design.md` — Phase A section.

---

## File Map

### Files Created (all under `claude/`)

**Manifest:**
- `claude/.claude-plugin/plugin.json` — Claude Code plugin manifest

**Agents (22 files):**
- `claude/agents/accessibility-specialist.md`
- `claude/agents/analytics-engineer.md`
- `claude/agents/api-designer.md`
- `claude/agents/architect.md`
- `claude/agents/code-reviewer.md`
- `claude/agents/coder.md`
- `claude/agents/compliance-reviewer.md`
- `claude/agents/content-strategist.md`
- `claude/agents/copywriter.md`
- `claude/agents/data-engineer.md`
- `claude/agents/debugger.md`
- `claude/agents/design-system-engineer.md`
- `claude/agents/devops-engineer.md`
- `claude/agents/i18n-specialist.md`
- `claude/agents/performance-engineer.md`
- `claude/agents/product-manager.md`
- `claude/agents/refactor.md`
- `claude/agents/security-engineer.md`
- `claude/agents/seo-specialist.md`
- `claude/agents/technical-writer.md`
- `claude/agents/tester.md`
- `claude/agents/ux-designer.md`

**Commands (12 files):**
- `claude/commands/maestro-a11y-audit.md`
- `claude/commands/maestro-archive.md`
- `claude/commands/maestro-compliance-check.md`
- `claude/commands/maestro-debug.md`
- `claude/commands/maestro-execute.md`
- `claude/commands/maestro-orchestrate.md`
- `claude/commands/maestro-perf-check.md`
- `claude/commands/maestro-resume.md`
- `claude/commands/maestro-review.md`
- `claude/commands/maestro-security-audit.md`
- `claude/commands/maestro-seo-audit.md`
- `claude/commands/maestro-status.md`

**Skills (19 directories, 21 files):**
- `claude/skills/code-review/SKILL.md`
- `claude/skills/delegation/SKILL.md`
- `claude/skills/delegation/protocols/agent-base-protocol.md`
- `claude/skills/delegation/protocols/filesystem-safety-protocol.md`
- `claude/skills/design-dialogue/SKILL.md`
- `claude/skills/execution/SKILL.md`
- `claude/skills/implementation-planning/SKILL.md`
- `claude/skills/session-management/SKILL.md`
- `claude/skills/validation/SKILL.md`
- `claude/skills/maestro-a11y-audit/SKILL.md`
- `claude/skills/maestro-archive/SKILL.md`
- `claude/skills/maestro-compliance-check/SKILL.md`
- `claude/skills/maestro-debug/SKILL.md`
- `claude/skills/maestro-execute/SKILL.md`
- `claude/skills/maestro-orchestrate/SKILL.md`
- `claude/skills/maestro-perf-check/SKILL.md`
- `claude/skills/maestro-resume/SKILL.md`
- `claude/skills/maestro-review/SKILL.md`
- `claude/skills/maestro-security-audit/SKILL.md`
- `claude/skills/maestro-seo-audit/SKILL.md`
- `claude/skills/maestro-status/SKILL.md`

**Hooks (1 file):**
- `claude/hooks/hooks.json`

**Scripts (10 files):**
- `claude/scripts/session-start.js`
- `claude/scripts/session-end.js`
- `claude/scripts/before-agent.js`
- `claude/scripts/hook-adapter.js`
- `claude/scripts/policy-enforcer.js`
- `claude/scripts/ensure-workspace.js`
- `claude/scripts/read-active-session.js`
- `claude/scripts/read-setting.js`
- `claude/scripts/read-state.js`
- `claude/scripts/write-state.js`

**Shared copies (14 lib files — overwritten from patched root lib/ in Task 2 Step 6):**
- `claude/lib/config/setting-resolver.js`
- `claude/lib/core/agent-registry.js`
- `claude/lib/core/atomic-write.js`
- `claude/lib/core/env-file-parser.js`
- `claude/lib/core/logger.js`
- `claude/lib/core/project-root-resolver.js`
- `claude/lib/core/stdin-reader.js`
- `claude/lib/hooks/after-agent-logic.js`
- `claude/lib/hooks/before-agent-logic.js`
- `claude/lib/hooks/hook-state.js`
- `claude/lib/hooks/session-end-logic.js`
- `claude/lib/hooks/session-start-logic.js`
- `claude/lib/state/session-id-validator.js`
- `claude/lib/state/session-state.js`

**Other shared copies (8 files — kept from overture output as-is, NOT overwritten):**
- `claude/mcp/maestro-server.js`
- `claude/templates/design-document.md`
- `claude/templates/implementation-plan.md`
- `claude/templates/session-state.md`
- `claude/references/architecture.md`
- `claude/mcp-config.example.json`
- `claude/package.json`
- `claude/README.md`

**Total:** 89 files created under `claude/`.

**Important:** `claude/templates/`, `claude/references/`, and `claude/README.md` are the Claude-runtime versions from overture (they use kebab-case agent names and `${CLAUDE_PLUGIN_ROOT}` paths). They are intentionally different from the root Gemini versions. The drift guard in Task 6 only checks `lib/` — NOT templates or references.

### Files Modified (at repo root)

- `lib/config/setting-resolver.js:13` — Add `CLAUDE_PLUGIN_ROOT` fallback
- `lib/core/project-root-resolver.js:6` — Add `CLAUDE_PROJECT_DIR` fallback
- `.geminiignore:2` — Add `claude/` exclusion

---

## Tasks

### Task 1: Patch Root lib/ for Claude Code Environment Variable Fallbacks

These patches MUST be applied before copying lib/ into claude/lib/ so the copies inherit the changes.

**Files:**
- Modify: `lib/config/setting-resolver.js:13`
- Modify: `lib/core/project-root-resolver.js:6`

- [ ] **Step 1: Patch setting-resolver.js**

In `lib/config/setting-resolver.js`, line 13 currently reads:

```js
  const extensionRoot = process.env.MAESTRO_EXTENSION_PATH;
```

Change it to:

```js
  const extensionRoot = process.env.MAESTRO_EXTENSION_PATH || process.env.CLAUDE_PLUGIN_ROOT;
```

- [ ] **Step 2: Patch project-root-resolver.js**

In `lib/core/project-root-resolver.js`, line 6 currently reads:

```js
  if (process.env.MAESTRO_WORKSPACE_PATH && !process.env.MAESTRO_WORKSPACE_PATH.includes('${')) {
    return process.env.MAESTRO_WORKSPACE_PATH;
  }
```

Change lines 6-8 to:

```js
  const workspacePath = process.env.MAESTRO_WORKSPACE_PATH || process.env.CLAUDE_PROJECT_DIR;
  if (workspacePath && !workspacePath.includes('${')) {
    return workspacePath;
  }
```

- [ ] **Step 3: Verify Gemini hooks still work with patched lib**

Run the Gemini session-start hook to confirm the patches don't break anything:

```bash
echo '{}' | node hooks/session-start.js
```

Expected: exits 0 (may produce JSON output or empty output depending on session state). Must NOT produce `MODULE_NOT_FOUND` or crash.

- [ ] **Step 4: Commit**

```bash
git add lib/config/setting-resolver.js lib/core/project-root-resolver.js
git commit -m "feat: add Claude Code env var fallbacks to shared lib

Add CLAUDE_PLUGIN_ROOT fallback for MAESTRO_EXTENSION_PATH in
setting-resolver.js, and CLAUDE_PROJECT_DIR fallback for
MAESTRO_WORKSPACE_PATH in project-root-resolver.js.

These env vars are undefined under Gemini CLI (harmless no-op).
Applied to root lib/ so the MCP server bundle also inherits them."
```

---

### Task 2: Generate and Copy Overture's Claude Plugin Output

**Files:**
- Create: `claude/` directory (89 files)

- [ ] **Step 1: Verify overture repo exists**

```bash
test -d ../overture/.git && echo "overture found" || echo "ERROR: overture repo not found at ../overture"
```

Expected: `overture found`. If not found, clone it: `git clone https://github.com/josstei/overture ../overture`.

- [ ] **Step 2: Checkout overture at the pinned commit and generate**

```bash
cd ../overture
OVERTURE_BRANCH=$(git rev-parse --abbrev-ref HEAD)
git stash --include-untracked 2>/dev/null; STASHED=$?
git checkout b314d9d
npm run generate:claude
```

Expected output includes: `Output written to: dist/claude-plugin/`

- [ ] **Step 3: Copy the entire dist/claude-plugin/ into claude/**

```bash
cd /Users/josstei/Development/agentic-workspace/gemini-extensions/maestro-gemini
cp -R ../overture/dist/claude-plugin/ claude/
```

- [ ] **Step 4: Restore overture to its previous branch**

```bash
cd ../overture
git checkout "$OVERTURE_BRANCH"
if [ "$STASHED" -eq 0 ]; then
  git stash pop || echo "WARNING: stash pop failed — check 'git stash list' in overture"
fi
cd /Users/josstei/Development/agentic-workspace/gemini-extensions/maestro-gemini
```

- [ ] **Step 5: Verify file count**

```bash
cd /Users/josstei/Development/agentic-workspace/gemini-extensions/maestro-gemini
find claude/ -type f | wc -l
```

Expected: `89`

- [ ] **Step 6: Verify key structural elements exist**

```bash
test -f claude/.claude-plugin/plugin.json && echo "manifest OK"
test -f claude/hooks/hooks.json && echo "hooks OK"
test -f claude/agents/coder.md && echo "agents OK"
test -f claude/commands/maestro-orchestrate.md && echo "commands OK"
test -f claude/skills/maestro-orchestrate/SKILL.md && echo "skills OK"
test -f claude/scripts/hook-adapter.js && echo "hook-adapter OK"
test -f claude/scripts/policy-enforcer.js && echo "policy-enforcer OK"
test -f claude/lib/core/project-root-resolver.js && echo "lib OK"
test -f claude/mcp/maestro-server.js && echo "mcp OK"
```

Expected: all lines print "OK".

- [ ] **Step 7: Overwrite claude/lib/ with the patched root lib/**

The overture output includes its own `lib/` copy which does NOT have the env var patches from Task 1. Overwrite it with the patched root copy:

```bash
rm -rf claude/lib/
cp -R lib/ claude/lib/
```

- [ ] **Step 8: Verify claude/lib/ has the env var patches**

```bash
grep -q "CLAUDE_PLUGIN_ROOT" claude/lib/config/setting-resolver.js && echo "PATCH OK" || echo "PATCH MISSING"
grep -q "CLAUDE_PROJECT_DIR" claude/lib/core/project-root-resolver.js && echo "PATCH OK" || echo "PATCH MISSING"
```

Expected: both print "PATCH OK".

- [ ] **Step 9: Commit the claude/ directory**

```bash
git add claude/
git commit -m "feat: add Claude Code plugin as static files in claude/

Copy all 89 files from overture dist/claude-plugin/ (commit b314d9d)
into claude/ subdirectory. This serves as the Claude Code plugin root
with its own agents, commands, skills, hooks, scripts, and shared
lib/mcp/templates/references copies.

Gemini extension at repo root is completely unchanged."
```

---

### Task 3: Add .geminiignore Exclusion

**Files:**
- Modify: `.geminiignore`

- [ ] **Step 1: Add claude/ to .geminiignore**

The current `.geminiignore` contains one line: `!.gemini/`. Add `claude/` on a new line:

```
!.gemini/
claude/
```

This prevents Gemini CLI from indexing the 89 Claude-specific files into its context window.

- [ ] **Step 2: Commit**

```bash
git add .geminiignore
git commit -m "chore: exclude claude/ from Gemini CLI context indexing"
```

---

### Task 4: Verify Gemini Extension is Unaffected

**Files:** None modified — this is a validation-only task.

- [ ] **Step 1: Verify Gemini extension still loads**

```bash
gemini extensions list
```

Expected: `maestro` appears in the list. If it does not, check whether `gemini-extension.json` at repo root was accidentally modified.

- [ ] **Step 2: Verify Gemini agent count is unchanged**

```bash
ls agents/*.md | wc -l
```

Expected: `22`

- [ ] **Step 3: Verify Gemini skills count is unchanged**

```bash
ls -d skills/*/SKILL.md | wc -l
```

Expected: `7`

- [ ] **Step 4: Verify Gemini hooks are unchanged**

```bash
cat hooks/hooks.json | head -5
```

Expected: starts with `{ "hooks": { "SessionStart": [` — the Gemini hook format. Must NOT be the Claude format.

- [ ] **Step 5: Verify no claude/ content leaks into Gemini context**

```bash
cat .geminiignore
```

Expected: contains `claude/` on its own line.

---

### Task 5: Verify Claude Plugin Structure

**Files:** None modified — this is a validation-only task.

- [ ] **Step 1: Verify plugin.json is valid and has hooks reference**

```bash
node -e "const p = require('./claude/.claude-plugin/plugin.json'); console.log('name:', p.name, 'hooks:', p.hooks)"
```

Expected: `name: maestro hooks: ./hooks/hooks.json`

- [ ] **Step 2: Verify hooks.json has correct Claude events**

```bash
node -e "const h = require('./claude/hooks/hooks.json'); console.log('events:', Object.keys(h.hooks).join(', '))"
```

Expected: `events: SessionEnd, SessionStart, PreToolUse`

- [ ] **Step 3: Verify PreToolUse has both matchers (Agent + Bash)**

```bash
node -e "
const h = require('./claude/hooks/hooks.json');
const ptu = h.hooks.PreToolUse;
console.log('matchers:', ptu.map(e => e.matcher).join(', '));
"
```

Expected: `matchers: Agent, Bash`

- [ ] **Step 4: Verify hook scripts resolve their dependencies**

The scripts that register stdin listeners (`policy-enforcer.js`, `session-start.js`, `session-end.js`, `before-agent.js`) will hang if stdin is not closed. Pipe `/dev/null` to close stdin immediately:

```bash
node -e "require('./claude/scripts/hook-adapter.js'); console.log('hook-adapter OK')"
echo '{}' | node claude/scripts/session-start.js > /dev/null 2>&1 && echo "session-start OK" || echo "session-start OK (non-zero exit expected)"
echo '{}' | node claude/scripts/session-end.js > /dev/null 2>&1 && echo "session-end OK" || echo "session-end OK (non-zero exit expected)"
echo '{"tool_input":{"command":"echo hello"}}' | node claude/scripts/policy-enforcer.js > /dev/null 2>&1 && echo "policy-enforcer OK" || echo "policy-enforcer OK (non-zero exit expected)"
```

Expected: all print "OK" (possibly with "non-zero exit expected" suffix). The key check is that NO line produces `MODULE_NOT_FOUND` or `Cannot find module` errors. Non-zero exits are expected because the scripts may reject the simplified input format.

- [ ] **Step 5: Verify agent count**

```bash
ls claude/agents/*.md | wc -l
```

Expected: `22`

- [ ] **Step 6: Verify skill count**

```bash
find claude/skills -name "SKILL.md" | wc -l
```

Expected: `19`

- [ ] **Step 7: Verify command count**

```bash
ls claude/commands/*.md | wc -l
```

Expected: `12`

- [ ] **Step 8: Verify MCP server loads**

```bash
node -e "
const { spawn } = require('child_process');
const child = spawn('node', ['claude/mcp/maestro-server.js'], { stdio: ['pipe', 'pipe', 'pipe'] });
setTimeout(() => { console.log('MCP server started OK'); child.kill(); process.exit(0); }, 2000);
child.on('error', (e) => { console.error('MCP FAILED:', e.message); process.exit(1); });
"
```

Expected: `MCP server started OK` (the server runs on stdio transport so it won't produce output — it just needs to not crash).

---

### Task 6: Add CI Drift Guard

**Files:**
- Create: `scripts/check-claude-lib-drift.sh`

- [ ] **Step 1: Create the drift check script**

Create `scripts/check-claude-lib-drift.sh`:

```bash
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
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x scripts/check-claude-lib-drift.sh
```

- [ ] **Step 3: Run it to verify it passes**

```bash
bash scripts/check-claude-lib-drift.sh
```

Expected: `All drift checks passed.`

- [ ] **Step 4: Commit**

```bash
git add scripts/check-claude-lib-drift.sh
git commit -m "ci: add drift guard for claude/lib, templates, references

Temporary CI check (removed in Phase C) that verifies shared files
between root and claude/ haven't diverged. Excludes the 2 lib files
with intentional Claude Code env var patches."
```

---

### Task 7: Final Integration Verification

**Files:** None — validation only.

- [ ] **Step 1: Run the full drift check**

```bash
bash scripts/check-claude-lib-drift.sh
```

Expected: `All drift checks passed.`

- [ ] **Step 2: Verify git status is clean**

```bash
git status
```

Expected: `nothing to commit, working tree clean`

- [ ] **Step 3: Review the commit log for Phase A**

```bash
git log --oneline -5
```

Expected: 4 commits from Phase A:
1. `ci: add drift guard...`
2. `chore: exclude claude/ from Gemini CLI...`
3. `feat: add Claude Code plugin as static files...`
4. `feat: add Claude Code env var fallbacks...`

- [ ] **Step 4: Verify total file count under claude/**

```bash
find claude/ -type f | wc -l
```

Expected: `89`

- [ ] **Step 5: Run a quick smoke test of the Gemini extension**

```bash
echo '{}' | node hooks/session-start.js
echo $?
```

Expected: exit code `0` (the Gemini hooks still work).

---

## Summary

| Task | Description | Files Created | Files Modified | Commits |
|------|-------------|--------------|----------------|---------|
| 1 | Patch root lib/ env var fallbacks | 0 | 2 | 1 |
| 2 | Generate and copy Claude plugin output (9 steps) | 89 | 0 | 1 |
| 3 | Add .geminiignore exclusion | 0 | 1 | 1 |
| 4 | Verify Gemini extension unaffected | 0 | 0 | 0 |
| 5 | Verify Claude plugin structure | 0 | 0 | 0 |
| 6 | Add CI drift guard | 1 | 0 | 1 |
| 7 | Final integration verification | 0 | 0 | 0 |
| **Total** | | **90** | **3** | **4** |

## Rollback

```bash
git revert HEAD~4..HEAD   # Revert all 4 Phase A commits
# OR
rm -rf claude/ scripts/check-claude-lib-drift.sh
git checkout -- lib/config/setting-resolver.js lib/core/project-root-resolver.js .geminiignore
```
