.PHONY: help install test check fix tsc clean dev release

# Default target
help:
	@echo "Cadabra Development Commands"
	@echo ""
	@echo "Usage: make [target]"
	@echo ""
	@echo "Targets:"
	@echo "  install          Install dependencies"
	@echo "  test             Run all tests (unit + integration)"
	@echo "  test-unit        Run unit tests only"
	@echo "  test-integration Run integration tests only"
	@echo "  bench            Run performance benchmarks"
	@echo "  check            Run code style checks"
	@echo "  fix              Auto-fix code style issues"
	@echo "  tsc              Run TypeScript type checking"
	@echo "  dev              Start development server with hot reload"
	@echo "  clean            Remove build artifacts and dependencies"
	@echo "  release          Create a new release (usage: make release VERSION=x.y.z)"
	@echo ""
	@echo "Examples:"
	@echo "  make install"
	@echo "  make test"
	@echo "  make release VERSION=1.0.0"

# Install dependencies
install:
	bun install

# Run all tests
test:
	bun run test

# Run unit tests
test-unit:
	bun run test:cadabra

# Run integration tests
test-integration:
	bun run test:integration

# Run benchmarks
bench:
	bun run bench

# Check code style
check:
	bun run check

# Auto-fix code style
fix:
	bun run fix

# TypeScript type checking
tsc:
	bun run tsc

# Start development server
dev:
	cd packages/cadabra && bun run dev

# Clean build artifacts
clean:
	rm -rf node_modules
	rm -rf packages/*/node_modules
	rm -rf packages/cadabra/*.db
	rm -rf packages/integration-tests/*.db
	find . -name ".bun" -type d -exec rm -rf {} + 2>/dev/null || true

# Create a release
release:
ifndef VERSION
	@echo "Error: VERSION is required"
	@echo "Usage: make release VERSION=x.y.z"
	@echo "Example: make release VERSION=1.0.0"
	@exit 1
endif
	@echo "Creating release $(VERSION)..."
	./scripts/release.sh $(VERSION)
	@echo ""
	@echo "✅ Release $(VERSION) created successfully!"
	@echo ""
	@echo "GitHub Actions will now:"
	@echo "  1. Run CI checks (lint, test, type check)"
	@echo "  2. Build binaries for all platforms"
	@echo "  3. Create GitHub Release with binaries"
	@echo "  4. Publish library to NPM"
	@echo "  5. Build and push Docker images"
	@echo ""
	@echo "Monitor progress at:"
	@echo "  https://github.com/SebastiaanWouters/cadabra/actions"
