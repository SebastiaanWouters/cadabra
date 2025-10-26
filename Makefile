# Cadali Monorepo - Primary Command Interface
#
# Use these commands for all development tasks. This is the recommended way to
# interact with the monorepo. Individual package commands are still available
# but these provide consistent, monorepo-wide operations.

.PHONY: help install test test-ts test-php lint fix dev clean release
.PHONY: docker-build docker-run docker-up docker-down
.DEFAULT_GOAL := help

# ============================================================================
# HELP
# ============================================================================

help: ## Show this help message
	@echo "Cadali Monorepo - Available Commands"
	@echo ""
	@echo "Development:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "Examples:"
	@echo "  make install              # Install all dependencies"
	@echo "  make test                 # Run all tests"
	@echo "  make release VERSION=1.0.0  # Create a release"

# ============================================================================
# DEVELOPMENT
# ============================================================================

install: ## Install all dependencies (TypeScript + PHP)
	@echo "📦 Installing TypeScript dependencies..."
	@bun install
	@echo ""
	@echo "📦 Installing PHP dependencies..."
	@cd packages/cadabra-php && composer install
	@cd packages/cadabra-php/symfony-test-app && composer install
	@echo ""
	@echo "✅ All dependencies installed!"
	@echo ""
	@echo "Next steps:"
	@echo "  make test    # Run all tests"
	@echo "  make lint    # Check code style"
	@echo "  make dev     # Start development server"

test: ## Run all tests (TypeScript + PHP)
	@echo "🧪 Running TypeScript tests..."
	@bun run test
	@echo ""
	@echo "🧪 Running PHP tests..."
	@cd packages/cadabra-php && composer test
	@echo ""
	@echo "✅ All tests passed!"

test-ts: ## Run only TypeScript tests
	@echo "🧪 Running TypeScript tests..."
	@bun run test
	@echo "✅ TypeScript tests passed!"

test-php: ## Run only PHP tests
	@echo "🧪 Running PHP unit tests..."
	@cd packages/cadabra-php && composer test:unit
	@echo ""
	@echo "🧪 Running PHP integration tests (requires Cadabra server)..."
	@echo "Note: Start server with 'make dev' in another terminal if needed"
	@cd packages/cadabra-php/symfony-test-app && vendor/bin/phpunit
	@echo "✅ PHP tests passed!"

lint: ## Check code style (TypeScript + PHP)
	@echo "🔍 Checking TypeScript code style..."
	@bun run check
	@echo ""
	@echo "🔍 Checking PHP code style..."
	@cd packages/cadabra-php && composer cs:check
	@echo ""
	@echo "✅ Code style checks passed!"

fix: ## Auto-fix code style issues (TypeScript + PHP)
	@echo "🔧 Fixing TypeScript code style..."
	@bun run fix
	@echo ""
	@echo "🔧 Fixing PHP code style..."
	@cd packages/cadabra-php && composer cs:fix
	@echo ""
	@echo "✅ Code style fixed!"

dev: ## Start Cadabra development server with hot reload
	@echo "🚀 Starting Cadabra server on http://localhost:6942"
	@echo "Press Ctrl+C to stop"
	@cd packages/cadabra && bun --hot run server.ts

clean: ## Clean all build artifacts and dependencies
	@echo "🧹 Cleaning build artifacts..."
	@rm -rf node_modules
	@rm -rf packages/cadabra/node_modules
	@rm -rf packages/integration-tests/node_modules
	@rm -rf packages/cadabra-php/vendor
	@rm -rf packages/cadabra-php/symfony-test-app/vendor
	@rm -f *.log
	@rm -rf packages/cadabra-php/coverage
	@echo "✅ Clean complete!"

# ============================================================================
# DOCKER
# ============================================================================

docker-build: ## Build Docker image
	@echo "🐳 Building Docker image..."
	@cd packages/cadabra && docker build -t cadabra:dev .
	@echo "✅ Docker image built: cadabra:dev"

docker-run: ## Run Docker container
	@echo "🐳 Running Docker container on http://localhost:6942"
	@docker run -p 6942:6942 --rm --name cadabra-dev cadabra:dev

docker-up: ## Start services with docker-compose
	@echo "🐳 Starting docker-compose services..."
	@cd packages/cadabra && docker compose up -d
	@echo "✅ Services started! Check http://localhost:6942/health"

docker-down: ## Stop docker-compose services
	@echo "🐳 Stopping docker-compose services..."
	@cd packages/cadabra && docker compose down
	@echo "✅ Services stopped!"

# ============================================================================
# RELEASE & PUBLISHING
# ============================================================================

release: ## Create a new release (e.g., make release VERSION=1.0.0)
ifndef VERSION
	@echo "❌ Error: VERSION is required"
	@echo ""
	@echo "Usage:"
	@echo "  make release VERSION=1.0.0"
	@echo ""
	@echo "This will:"
	@echo "  1. Update version in package.json and composer.json"
	@echo "  2. Update CHANGELOG.md"
	@echo "  3. Create git commit and tag"
	@echo "  4. Push to GitHub"
	@echo "  5. Trigger automated publishing (NPM, Docker, Packagist)"
	@exit 1
endif
	@echo "🚀 Creating release $(VERSION)..."
	@./scripts/release.sh $(VERSION)
	@echo ""
	@echo "✅ Release $(VERSION) created!"
	@echo ""
	@echo "GitHub Actions will automatically:"
	@echo "  - Run quality checks (CI)"
	@echo "  - Create GitHub Release"
	@echo "  - Publish to NPM"
	@echo "  - Build and push Docker image"
	@echo "  - Update Packagist"
	@echo ""
	@echo "Monitor at: https://github.com/sebastiaanwouters/cadali/actions"
