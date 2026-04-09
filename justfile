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
    @echo "  just test             Run all 120 tests"
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
    node --test tests/transforms/copy.test.js tests/transforms/strip-feature.test.js tests/transforms/replace-agent-names.test.js tests/transforms/replace-tool-names.test.js tests/transforms/replace-paths.test.js tests/transforms/inject-frontmatter.test.js tests/transforms/skill-metadata.test.js tests/transforms/index.test.js tests/transforms/mcp-content-handlers.test.js tests/transforms/project-root-resolver.test.js tests/integration/generator.test.js tests/integration/zero-diff.test.js

# Run only transform unit tests
test-transforms:
    node --test tests/transforms/copy.test.js tests/transforms/strip-feature.test.js tests/transforms/replace-agent-names.test.js tests/transforms/replace-tool-names.test.js tests/transforms/replace-paths.test.js tests/transforms/inject-frontmatter.test.js tests/transforms/skill-metadata.test.js tests/transforms/index.test.js tests/transforms/mcp-content-handlers.test.js tests/transforms/project-root-resolver.test.js

# Run only integration tests
test-integration:
    node --test tests/integration/generator.test.js tests/integration/zero-diff.test.js

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
