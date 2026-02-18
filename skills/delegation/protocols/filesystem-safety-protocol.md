# Filesystem Safety Protocol

This protocol is injected into every delegation prompt alongside the Agent Base Protocol. It defines mandatory filesystem safety rules that all agents must follow to prevent errors from missing directories.

---

## Rule 1 — Ensure Before Write

Before any file creation, write, or move operation, verify the target's parent directory exists. If it doesn't, create it using `mkdir -p`. This applies to every file operation that produces output at a path — writes, moves, copies, renames.

**Protocol Override:** This rule modifies the base protocol's Scope Verification Step 2, specifically the check "Files listed for creation have existing parent directories." When parent directories are missing, create the missing directory using `mkdir -p` and continue with the file operation. Do NOT stop and report the issue as a verification failure. All other Step 2 verifications (file existence, tool permissions, scope boundaries) remain in effect.

## Rule 2 — Silent Success, Clear Failure

Directory creation is a precondition, not a noteworthy event. Do not report successful directory creation. Only report failures (permission denied, disk full) immediately as a blocker in the Task Report.

## Rule 3 — Never Assume Directory State

Treat every directory reference as potentially non-existent, even if a prior phase "should have" created it. Phases run independently (especially in parallel dispatch). Each agent ensures its own write targets exist.

## Rule 4 — Path Construction

Always construct full paths before writing. Never write to a path assembled from unverified components. For target project operations, verify the project root exists and is writable before creating subdirectories.

## Rule 5 — Scope

This protocol applies to Maestro state directories, target project directories, and archive operations.

## Rule 6 — Write Tool Only

All file content must be written using `write_file` or `replace` tools. Never use `run_shell_command` with `cat`, `echo`, `printf`, heredocs, or shell redirection (`>`, `>>`) to create or modify file content. Shell interpretation corrupts structured content (YAML, Markdown, JSON, code with special characters). This reinforces the Agent Base Protocol's File Writing Rule.
