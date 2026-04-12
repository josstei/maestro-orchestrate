# Maestro Orchestrate — development commands

# List available commands with descriptions
help:
    @echo "Maestro Orchestrate — development commands"
    @echo ""
    @echo "Generator:"
    @echo "  just generate         Generate all runtime files from src/"
    @echo "  just dry-run          Preview what would change without writing"
    @echo "  just diff             Show unified diff of what would change"
    @echo "  just clean            Delete all generated files and regenerate"
    @echo ""
    @echo "Testing:"
    @echo "  just test             Run all tests"
    @echo "  just test-transforms  Run only transform unit tests"
    @echo "  just test-integration Run only integration tests"
    @echo ""
    @echo "CI:"
    @echo "  just check            Generate + verify zero drift"
    @echo "  just ci               Full CI equivalent (check + test)"
    @echo ""
    @echo "Release:"
    @echo "  just release <ver>    Tag and push (e.g. just release 1.5.1)"

# Generate all runtime files from src/
generate:
    node scripts/generate.js

# Preview what the generator would change
dry-run:
    node scripts/generate.js --dry-run

# Show unified diff of what the generator would change
diff:
    node scripts/generate.js --diff

# Clean all generated files and regenerate from scratch
clean:
    node scripts/generate.js --clean
    node scripts/generate.js

# Run all tests
test:
    #!/usr/bin/env bash
    set -euo pipefail
    shopt -s nullglob
    files=(tests/unit/*.test.js tests/transforms/*.test.js tests/integration/*.test.js)
    if [ ${#files[@]} -eq 0 ]; then echo "No test files found"; exit 1; fi
    node --test "${files[@]}"

# Run only unit tests (core modules, hooks, handlers)
test-unit:
    #!/usr/bin/env bash
    set -euo pipefail
    shopt -s nullglob
    files=(tests/unit/*.test.js)
    if [ ${#files[@]} -eq 0 ]; then echo "No unit test files found"; exit 1; fi
    node --test "${files[@]}"

# Run only transform unit tests
test-transforms:
    #!/usr/bin/env bash
    set -euo pipefail
    shopt -s nullglob
    files=(tests/transforms/*.test.js)
    if [ ${#files[@]} -eq 0 ]; then echo "No transform test files found"; exit 1; fi
    node --test "${files[@]}"

# Run only integration tests
test-integration:
    #!/usr/bin/env bash
    set -euo pipefail
    shopt -s nullglob
    files=(tests/integration/*.test.js)
    if [ ${#files[@]} -eq 0 ]; then echo "No integration test files found"; exit 1; fi
    node --test "${files[@]}"

# Generate and verify zero drift (what CI runs)
check: generate
    #!/usr/bin/env bash
    if ! git diff --exit-code --name-only; then
        echo "ERROR: Generated files are out of sync with source. Run 'just generate' and commit."
        git diff --stat
        exit 1
    fi
    echo "No drift detected."

# Generate, test, and verify — full CI equivalent
ci: check test

# Tag and push a release
release version:
    git tag v{{version}}
    git push origin v{{version}}
