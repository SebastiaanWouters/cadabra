# Cadali

A monorepo for Cadabra - an intelligent query cache system with automatic invalidation.

## Prerequisites

This project uses [mise](https://mise.jdx.dev/) to manage tool versions. Make sure you have mise installed:

```bash
curl https://mise.run | sh
```

Or install via your package manager:
```bash
# macOS
brew install mise

# Ubuntu/Debian
apt install mise

# Other: https://mise.jdx.dev/getting-started.html
```

## Getting Started

1. **Install tool versions** (PHP 8.4, Bun 1.3):
   ```bash
   mise install
   ```

2. **Verify versions**:
   ```bash
   php --version  # Should show 8.4.x
   bun --version  # Should show 1.3.x
   ```

3. **Install dependencies**:
   ```bash
   bun install
   ```

4. **Run checks**:
   ```bash
   bun run check    # Run ultracite linter
   bun run tsc      # TypeScript type checking
   bun run test     # Run all tests
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

## Scripts

### Root-level scripts

- `bun run check` - Run ultracite linter on all packages
- `bun run fix` - Auto-fix linting issues
- `bun run tsc` - TypeScript type checking in all packages
- `bun run test` - Run all tests (both packages)
- `bun run test:cadabra` - Run core library tests
- `bun run test:integration` - Run integration tests
- `bun run bench` - Run performance benchmarks

### Package-specific scripts

```bash
# In packages/cadabra/
bun run tsc    # Type check
bun test       # Run tests

# In packages/integration-tests/
bun run setup      # Seed database
bun run test       # Run integration tests
bun run benchmark  # Run benchmarks
bun run clean      # Clean database
bun run all        # Clean, setup, and test

# In packages/cadabra-php/
composer install   # Install PHP dependencies
vendor/bin/phpunit # Run PHP tests
```

## Development Workflow

1. **Make changes** to TypeScript or PHP code
2. **Run linter**: `bun run check`
3. **Fix issues**: `bun run fix`
4. **Type check**: `bun run tsc`
5. **Run tests**: `bun run test`
6. **Run benchmarks** (optional): `bun run bench`

## Package Details

### packages/cadabra

Core TypeScript library for SQL query analysis and cache key generation.

- SQL parsing and normalization
- Cache key fingerprinting
- Invalidation analysis
- Zero runtime dependencies

### packages/integration-tests

Comprehensive integration tests using an e-commerce database with:
- 10,000 users
- 50 categories
- 5,000 products
- 50,000 orders
- 25,000 reviews

Tests cover:
- Simple queries (row lookups)
- Complex JOINs (2-5 tables)
- Aggregates (COUNT, SUM, AVG)
- Pagination
- Search queries
- Cache hit/miss scenarios
- Invalidation on writes

### packages/cadabra-php

PHP client and Symfony bundle for Doctrine ORM integration.

**Key Features**:
- Zero-code-change integration
- Intercepts at Doctrine DBAL level
- Automatic cache invalidation
- Transparent to ORM (lazy loading, events, etc.)
- Smart caching heuristics
- Per-table TTL configuration

See `packages/cadabra-php/README.md` for detailed documentation.

## Testing

All tests use Bun's built-in test runner:

```bash
# Run all tests
bun run test

# Run specific package tests
bun --filter cadabra test
bun --filter cadabra-integration-tests test

# Run benchmarks
bun run bench
```

### Test Results

Integration tests verify:
- ✅ All 103 tests passing
- ✅ Cache hit rates: 80-90%
- ✅ Performance gains: 3-10x faster with cache
- ✅ Automatic invalidation on writes

## Linting & Code Quality

This project uses [ultracite](https://ultracite.dev/) (Biome-based) for linting:

```bash
# Check all code
bun run check

# Auto-fix issues
bun run fix
```

Configuration in `biome.jsonc`.

## Tool Versions

Managed by mise (`.mise.toml`):
- **PHP**: 8.4 (via ubi:adwinying/php)
- **Bun**: 1.3

The PHP package (`cadabra-php`) is compatible with PHP 8.1+ but we develop/test on 8.4.

## Publishing & Deployment

This project has comprehensive publishing infrastructure for all distribution channels:

### Quick Release

```bash
# Using Makefile (recommended)
make release VERSION=1.0.0

# Or use the release script directly
./scripts/release.sh 1.0.0
```

### Distribution Channels

- **NPM Package**: `cadabra` - TypeScript library for Node.js/Bun
- **Docker Container**: `ghcr.io/sebastiaanwouters/cadabra/cadabra` - Containerized server
- **Packagist**: `cadabra/php` - PHP client and Symfony bundle

### Automated Publishing

GitHub Actions automatically handles:
- ✅ **CI/CD** - Tests on every PR
- ✅ **Docker** - Multi-platform images on tag push
- ✅ **NPM** - Publish on GitHub release
- ✅ **Packagist** - Auto-updates on tag push

See [PUBLISHING.md](./PUBLISHING.md) for complete publishing guide.

### Using Published Packages

**TypeScript/Node.js:**
```bash
npm install cadabra
# or
bun add cadabra
```

**PHP/Symfony:**
```bash
composer require cadabra/php
```

**Docker:**
```bash
docker pull ghcr.io/sebastiaanwouters/cadabra/cadabra:latest
docker run -p 6942:6942 ghcr.io/sebastiaanwouters/cadabra/cadabra
```

## Makefile Commands

Convenient shortcuts for common tasks:

```bash
make help           # Show all available commands
make install        # Install all dependencies
make test           # Run all tests
make lint           # Run linters
make dev            # Start dev server
make docker-build   # Build Docker image
make release        # Prepare new release
```

## Documentation

- [PUBLISHING.md](./PUBLISHING.md) - Complete publishing guide
- [CHANGELOG.md](./CHANGELOG.md) - Release history
- [packages/cadabra/DEPLOYMENT.md](./packages/cadabra/DEPLOYMENT.md) - Deployment guide
- [packages/cadabra-php/README.md](./packages/cadabra-php/README.md) - PHP integration guide

## License

MIT - See [LICENSE](./LICENSE) for details
