# Cadali

A monorepo for Cadabra - an intelligent query cache system with automatic invalidation.

## Quick Start

```bash
# 1. Install tool versions (PHP 8.4, Bun 1.3)
mise install

# 2. Install dependencies
make install

# 3. Run quality checks
make test
make lint
```

That's it! See [CLAUDE.md](./CLAUDE.md) for detailed development guide.

## Prerequisites

This project uses [mise](https://mise.jdx.dev/) to manage tool versions:

```bash
# Install mise
curl https://mise.run | sh

# Or via package manager
brew install mise           # macOS
apt install mise            # Ubuntu/Debian
```

## Project Structure

```
packages/
├── cadabra/                    # TypeScript core library
│   ├── cadabra.ts             # Query analysis and cache key generation
│   ├── cadabra.test.ts        # Unit tests
│   └── package.json
│
├── integration-tests/          # Integration tests with SQLite
│   ├── app.ts                 # E-commerce test app
│   ├── setup.ts               # Database seeding
│   ├── integration.test.ts    # Integration tests
│   ├── benchmark.test.ts      # Performance benchmarks
│   └── package.json
│
└── cadabra-php/               # PHP client + Symfony bundle
    ├── src/
    │   ├── Client/            # HTTP client
    │   └── SymfonyBundle/     # Doctrine DBAL middleware
    ├── tests/
    ├── composer.json
    └── README.md
```

## Common Commands

**Use the Makefile as your primary interface:**

```bash
# Development
make install        # Install all dependencies (TypeScript + PHP)
make test           # Run all tests (TypeScript + PHP)
make test-ts        # Run only TypeScript tests
make test-php       # Run only PHP tests
make lint           # Check code style (all packages)
make fix            # Auto-fix code style issues
make dev            # Start Cadabra dev server

# Docker
make docker-build   # Build Docker image
make docker-up      # Start docker-compose
make docker-down    # Stop docker-compose

# Release
make release VERSION=1.0.0   # Create new release

# Help
make help           # Show all available commands
```

## Development Workflow

1. Make your code changes
2. Run `make fix` to auto-fix code style
3. Run `make lint` to check for remaining issues
4. Run `make test` to verify all tests pass
5. Commit your changes

See [CLAUDE.md](./CLAUDE.md) for comprehensive development guide.

## Packages

This monorepo contains three packages:

### packages/cadabra - TypeScript Core Library

SQL query analysis and cache key generation with HTTP REST API server.

**Documentation:**
- [README.md](./packages/cadabra/README.md) - API usage and deployment
- [CLAUDE.md](./packages/cadabra/CLAUDE.md) - Development guide

### packages/cadabra-php - PHP Client & Symfony Bundle

PHP client and Symfony bundle for Doctrine ORM integration with zero-code-change setup.

**Documentation:**
- [README.md](./packages/cadabra-php/README.md) - Installation and usage
- [CLAUDE.md](./packages/cadabra-php/CLAUDE.md) - Development guide

### packages/integration-tests - E2E Testing Suite

Comprehensive integration tests with an e-commerce database (10K users, 5K products, 50K orders).

**Documentation:**
- [README.md](./packages/integration-tests/README.md) - Test suite details

## Testing

```bash
make test           # Run all tests (TypeScript + PHP)
make test-ts        # Run only TypeScript tests
make test-php       # Run only PHP tests
```

TypeScript tests use Bun's built-in test runner. PHP tests use PHPUnit 10+.

## Code Quality

```bash
make lint           # Check code style (Biome + PHP CS Fixer)
make fix            # Auto-fix code style issues
```

Linting configuration:
- TypeScript: `biome.jsonc` (via ultracite)
- PHP: `.php-cs-fixer.dist.php` (PSR-12)

## Releasing

Create a new release with automatic quality checks and publishing:

```bash
make release VERSION=1.0.0
```

This will:
1. Update version in `package.json` and `composer.json`
2. Update `CHANGELOG.md`
3. Create git commit and tag
4. Push to GitHub
5. Trigger automated publishing to NPM, Docker, and Packagist

See [PUBLISHING.md](./PUBLISHING.md) for detailed release process.

## Using Published Packages

### TypeScript/JavaScript
```bash
npm install cadabra
bun add cadabra
```

### PHP/Symfony
```bash
composer require cadabra/php
```

### Docker
```bash
docker pull ghcr.io/sebastiaanwouters/cadabra:latest
docker run -p 6942:6942 ghcr.io/sebastiaanwouters/cadabra:latest
```

## Documentation

### Root Documentation
- [README.md](./README.md) - This file (quick start and overview)
- [CLAUDE.md](./CLAUDE.md) - Comprehensive development guide
- [PUBLISHING.md](./PUBLISHING.md) - Release and publishing workflows
- [CHANGELOG.md](./CHANGELOG.md) - Release history

### Package Documentation
- [packages/cadabra/README.md](./packages/cadabra/README.md) - TypeScript library usage
- [packages/cadabra/CLAUDE.md](./packages/cadabra/CLAUDE.md) - TypeScript package development
- [packages/cadabra-php/README.md](./packages/cadabra-php/README.md) - PHP client usage
- [packages/cadabra-php/CLAUDE.md](./packages/cadabra-php/CLAUDE.md) - PHP package development

## License

MIT - See [LICENSE](./LICENSE) for details
