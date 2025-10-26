# Cadabra Makefile - Simplified commands for development and publishing

.PHONY: help install test lint build clean release publish

# Default target
help:
	@echo "Cadabra Development Commands"
	@echo ""
	@echo "Development:"
	@echo "  make install        Install all dependencies"
	@echo "  make test           Run all tests"
	@echo "  make lint           Run linters"
	@echo "  make fix            Fix linting issues"
	@echo "  make dev            Start dev server with hot reload"
	@echo ""
	@echo "Docker:"
	@echo "  make docker-build   Build Docker image"
	@echo "  make docker-run     Run Docker container"
	@echo "  make docker-up      Start with docker-compose"
	@echo "  make docker-down    Stop docker-compose"
	@echo ""
	@echo "Release & Publishing:"
	@echo "  make release VERSION=1.0.0    Prepare release"
	@echo "  make publish-npm              Publish to NPM"
	@echo "  make publish-docker           Publish Docker image"
	@echo ""
	@echo "Cleanup:"
	@echo "  make clean          Clean build artifacts"

# Development
install:
	@echo "Installing dependencies..."
	bun install
	cd packages/cadabra-php && composer install

test:
	@echo "Running tests..."
	bun run test
	cd packages/cadabra-php && composer test

lint:
	@echo "Running linters..."
	bun run check

fix:
	@echo "Fixing linting issues..."
	bun run fix

dev:
	@echo "Starting development server..."
	cd packages/cadabra && bun --hot run server.ts

# Docker
docker-build:
	@echo "Building Docker image..."
	cd packages/cadabra && docker build -t cadabra-server .

docker-run:
	@echo "Running Docker container..."
	docker run -p 6942:6942 --rm cadabra-server

docker-up:
	@echo "Starting with docker-compose..."
	cd packages/cadabra && docker compose up -d

docker-down:
	@echo "Stopping docker-compose..."
	cd packages/cadabra && docker compose down

# Release & Publishing
release:
ifndef VERSION
	@echo "Error: VERSION is required. Usage: make release VERSION=1.0.0"
	@exit 1
endif
	@echo "Preparing release $(VERSION)..."
	./scripts/release.sh $(VERSION)

publish-npm:
	@echo "Publishing to NPM..."
	cd packages/cadabra && npm publish

publish-docker:
	@echo "Docker publishing is automated via GitHub Actions"
	@echo "Push a tag to trigger: git push origin v$(VERSION)"

# Cleanup
clean:
	@echo "Cleaning build artifacts..."
	rm -rf packages/cadabra/node_modules
	rm -rf packages/cadabra-php/vendor
	rm -rf packages/integration-tests/node_modules
	rm -f *.log
	@echo "Clean complete!"
