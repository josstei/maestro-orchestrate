---
name: validation
description: Cross-cutting validation methodology for verifying phase outputs and project integrity
---

# Validation Skill

Activate this skill when validating phase outputs during orchestration execution or when running standalone validation checks. This skill provides the pipeline, heuristics, and interpretation rules for verifying that changes meet quality standards.

## Validation Pipeline

Execute validation steps in this order. Stop on the first blocking failure unless the user explicitly requests continuing.

### Step 1: Build / Compile
Verify the project compiles without errors.

| Project Type | Command |
|-------------|---------|
| Node.js (TypeScript) | `npx tsc --noEmit` |
| Node.js (JavaScript) | N/A (skip) |
| Rust | `cargo build` |
| Go | `go build ./...` |
| Python | `python -m py_compile [files]` |
| Java (Maven) | `mvn compile` |
| Java (Gradle) | `./gradlew compileJava` |

### Step 2: Lint / Format
Verify code meets style and quality standards.

| Project Type | Command |
|-------------|---------|
| Node.js | `npx eslint . && npx prettier --check .` |
| Rust | `cargo clippy && cargo fmt --check` |
| Go | `go vet ./... && gofmt -l .` |
| Python | `ruff check . && ruff format --check .` |
| Java | `mvn checkstyle:check` or `./gradlew checkstyleMain` |

### Step 3: Unit Tests
Run unit tests to verify behavior preservation.

| Project Type | Command |
|-------------|---------|
| Node.js (Jest) | `npx jest` |
| Node.js (Vitest) | `npx vitest run` |
| Rust | `cargo test` |
| Go | `go test ./...` |
| Python (pytest) | `python -m pytest tests/` |
| Java (Maven) | `mvn test` |
| Java (Gradle) | `./gradlew test` |

### Step 4: Integration Tests
Run integration tests if available and applicable.

Detect integration test presence by looking for:
- `tests/integration/`, `test/integration/`, or `**/integration_test*` directories/files
- Test files with `integration` in the name
- Test scripts in package.json (e.g., `test:integration`)

### Step 5: Manual Verification
For changes that cannot be automatically validated, present a checklist to the user.

## Project Type Detection

Detect the project type by checking for the presence of these files in the project root:

| Indicator File | Project Type |
|---------------|-------------|
| `package.json` | Node.js (check for `typescript` dep for TS) |
| `Cargo.toml` | Rust |
| `go.mod` | Go |
| `pyproject.toml` or `setup.py` | Python |
| `pom.xml` | Java (Maven) |
| `build.gradle` or `build.gradle.kts` | Java (Gradle) |
| `Gemfile` | Ruby |
| `*.csproj` or `*.sln` | .NET |

When multiple indicators are present, validate each project type independently.

## Validation Result Interpretation

### Pass
All executed validation steps completed with exit code 0. No errors or warnings that indicate broken functionality.

### Fail (Blocking)
Any of the following constitute a blocking failure:
- Build/compile errors
- Lint errors (not warnings, unless the project treats warnings as errors)
- Test failures
- Type errors

### Warn (Non-Blocking)
The following are recorded but do not block progression:
- Lint warnings (when not configured as errors)
- Deprecation notices
- Coverage decreases (unless coverage threshold is configured)
- Format-only issues (can be auto-fixed)

## Validation Modes

The validation strictness is controlled by `MAESTRO_VALIDATION_STRICTNESS` (default: `normal`).

| Mode | Behavior |
|------|----------|
| `strict` | Warnings are treated as blocking failures. All lint warnings, deprecation notices, and coverage decreases block phase progression. |
| `normal` | Only errors block. Warnings are recorded but do not prevent phase completion. This is the default behavior described in the Pass/Fail/Warn sections above. |
| `lenient` | Nothing blocks automatically. All failures and warnings are recorded in session state and reported to the user, but phase progression continues. The user reviews the accumulated report at completion. |

### Strictness Application

When evaluating each validation step:
1. Run the validation command and capture the exit code and output
2. Classify the result as Pass, Fail (Blocking), or Warn (Non-Blocking) using the standard criteria above
3. Apply the strictness mode:
   - `strict`: Fail (Blocking) AND Warn (Non-Blocking) both stop progression
   - `normal`: Only Fail (Blocking) stops progression
   - `lenient`: Record everything, stop nothing — append all results to session state and continue
4. If strictness causes a result to be downgraded from blocking to non-blocking, note this in the validation output: "Warning recorded but not blocking (lenient mode)"

## Post-Phase Validation

### When to Validate
Run validation after:
- Every phase that creates or modifies source code
- Every parallel batch completion (validate the combined result)
- Before marking any phase as `completed`

### When to Skip Validation
Skip validation when:
- The phase only modified documentation files
- The phase only produced read-only analysis (architect, code_reviewer reports)
- The user explicitly requests skipping validation

Record `skipped` with rationale in the phase validation result.

## Manual Verification Checklist

For changes that cannot be automatically validated, present this checklist template:

```
### Manual Verification Required

The following changes require manual verification:

- [ ] [Description of what to verify]
- [ ] [Visual/UI changes look correct]
- [ ] [Integration with external service works]
- [ ] [Environment-specific behavior confirmed]

Please confirm these items are verified before I mark this phase as complete.
```

Use manual verification for:
- UI/visual changes
- External service integrations
- Environment-specific configurations
- Performance improvements (require load testing)
- Security remediations (require penetration testing)

## Incremental Validation Mode

When full pipeline validation is unnecessary, use targeted validation based on the type of changes in the completed phase:

### Validation Scope by Change Type
- **Phase created new files only** (no existing files modified): Run lint + type check on the new files only. This provides fast feedback without running the full test suite against unchanged code.
- **Phase modified existing files**: Run the full test suite. Existing tests serve as behavior-preservation checks — any failure indicates a potential regression.
- **Phase touched configuration files** (build config, CI config, environment config, dependency manifests): Run the full pipeline (build + lint + type check + all tests). Configuration changes can have cascading effects across the entire project.
- **Phase only produced documentation or analysis**: Skip validation (record as `skipped` with rationale).

### Scope Detection
Determine the change type automatically from the completing agent's Task Report:
1. Parse Files Created and Files Modified lists
2. Classify each file: source code, test code, configuration, documentation
3. Apply the most comprehensive validation scope that matches any changed file type (e.g., if one config file and three source files changed, run the full pipeline because config was touched)

## Validation Failure Diagnosis

When validation fails, provide a structured diagnosis to help the orchestrator decide next steps.

### Diagnosis Protocol
1. **Categorize the failure**: type error, lint error, test failure, build error, runtime error
2. **Identify involved files**: Which files from the current phase appear in the error output?
3. **Determine causality**: Is the failure caused by the current phase's changes, or is it a pre-existing issue?
   - Check: Does the failure reference files modified in this phase?
   - Check: Run validation against a clean snapshot while always restoring local state:
     - `git stash push --include-untracked -m "maestro-causality-check"`
     - `[validation command]` (capture exit code as `validation_exit`)
     - `git stash pop` (run regardless of `validation_exit`)
   - If `validation_exit` is non-zero in the clean snapshot, classify the failure as pre-existing.
   - If `git stash pop` fails, mark the diagnosis as inconclusive until restoration conflicts are resolved.
4. **Classify resolution path**:
   - **Fixable by same agent**: The error is in files the agent owns, the fix is straightforward (missing import, type mismatch, lint violation). Re-delegate to the same agent with the error context.
   - **Requires different agent**: The error is caused by an interface mismatch between phases. Identify which phase introduced the incompatibility.
   - **Requires human input**: The error reveals an ambiguity in the design or plan that cannot be resolved without user guidance. Escalate with full context.

### Diagnosis Output Format
```
### Validation Diagnosis
- **Failure Type**: [type error | lint error | test failure | build error]
- **Failing Files**: [list of files from current phase involved in the failure]
- **Root Cause**: [brief description of why validation failed]
- **Pre-existing**: [yes | no — was this failure present before this phase's changes?]
- **Resolution Path**: [re-delegate to same agent | escalate to user | requires cross-phase fix]
- **Recommended Action**: [specific next step with context to include in re-delegation or escalation]
```
