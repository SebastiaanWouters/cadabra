# Cadabra

Intelligent query cache system with automatic invalidation. This repository contains the TypeScript core library and HTTP server.

> **PHP Client**: For PHP/Symfony integration, see [cadabra-php](https://github.com/SebastiaanWouters/cadabra-php)

## Installation

### Server (Standalone Binary)

Install the Cadabra server with a single command:

**Linux / macOS:**
```bash
curl -fsSL https://raw.githubusercontent.com/SebastiaanWouters/cadabra/main/scripts/install.sh | bash
```

**Windows (PowerShell):**
```powershell
irm https://raw.githubusercontent.com/SebastiaanWouters/cadabra/main/scripts/install.ps1 | iex
```

Then start the server:
```bash
cadabra
```

### Library (NPM Package)

For programmatic usage in your TypeScript/JavaScript projects:

```bash
npm install @sebastiaanwouters/cadabra
bun add @sebastiaanwouters/cadabra
```

### Manual Download

Download pre-compiled binaries from [GitHub Releases](https://github.com/SebastiaanWouters/cadabra/releases):

- `cadabra-linux-x64` - Linux x86_64
- `cadabra-linux-arm64` - Linux ARM64
- `cadabra-darwin-x64` - macOS Intel
- `cadabra-darwin-arm64` - macOS Apple Silicon
- `cadabra-windows-x64.exe` - Windows x64

### Docker

```bash
docker pull ghcr.io/sebastiaanwouters/cadabra:latest
docker run -p 6942:6942 ghcr.io/sebastiaanwouters/cadabra:latest
```

## Quick Start (Development)

```bash
# 1. Install tool versions (Bun 1.3)
mise install

# 2. Install dependencies
bun install

# 3. Run quality checks
bun run test
bun run check
```

See [CLAUDE.md](./CLAUDE.md) for detailed development guide.

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
├── cadabra/                    # TypeScript core library & HTTP server
│   ├── cadabra.ts             # Query analysis and cache key generation
│   ├── server.ts              # HTTP REST API server
│   ├── cadabra.test.ts        # Unit tests
│   ├── Dockerfile             # Container image
│   └── package.json
│
└── integration-tests/          # Integration tests with SQLite
    ├── app.ts                 # E-commerce test app
    ├── setup.ts               # Database seeding
    ├── integration.test.ts    # Integration tests
    ├── benchmark.test.ts      # Performance benchmarks
    └── package.json
```

## Common Commands

**Using Bun scripts:**

```bash
# Development
bun install          # Install all dependencies
bun run dev          # Start Cadabra dev server with hot reload
bun run test         # Run all tests (core + integration)
bun run test:cadabra # Run only core library tests
bun run test:integration # Run only integration tests
bun run bench        # Run performance benchmarks
bun run check        # Check code style (Biome)
bun run fix          # Auto-fix code style issues
bun run tsc          # Type check all packages

# Docker
bun run docker:build # Build Docker image
bun run docker:run   # Run Docker container
bun run docker:up    # Start docker-compose
bun run docker:down  # Stop docker-compose

# Cleanup
bun run clean        # Remove node_modules and logs
```

## Development Workflow

1. Make your code changes
2. Run `bun run fix` to auto-fix code style
3. Run `bun run check` to verify code style
4. Run `bun run test` to verify all tests pass
5. Commit your changes

See [CLAUDE.md](./CLAUDE.md) for comprehensive development guide.

## Packages

This monorepo contains two packages:

### packages/cadabra - TypeScript Core Library & HTTP Server

SQL query analysis, cache key generation, and HTTP REST API server.

**Documentation:**
- [README.md](./packages/cadabra/README.md) - API usage and deployment
- [CLAUDE.md](./packages/cadabra/CLAUDE.md) - Development guide

**Features:**
- SQL parsing and normalization
- Cache key fingerprint generation
- Invalidation analysis
- HTTP REST API
- Docker support

### packages/integration-tests - E2E Testing Suite

Comprehensive integration tests with an e-commerce database (10K users, 5K products, 50K orders).

**Documentation:**
- [README.md](./packages/integration-tests/README.md) - Test suite details

**Includes:**
- Integration tests for all query types
- Performance benchmarks
- Cache hit/miss verification

## Testing

```bash
bun run test           # Run all tests (core + integration)
bun run test:cadabra   # Run only core library tests
bun run test:integration # Run only integration tests
bun run bench          # Run performance benchmarks
```

All tests use Bun's built-in test runner.

## Code Quality

```bash
bun run check        # Check code style (Biome)
bun run fix          # Auto-fix code style issues
bun run tsc          # Type check all packages
```

Linting configuration:
- TypeScript: `biome.jsonc` (via ultracite)

## Releasing

Create a new release:

```bash
# Create and push version tag
./scripts/release.sh 1.0.0
```

This will:
1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Create git commit and tag
4. Push to GitHub

GitHub Actions will then automatically:
- Run quality checks (CI)
- Create GitHub Release
- Publish to NPM
- Build and push Docker images

See [PUBLISHING.md](./PUBLISHING.md) for detailed release process.

## Distribution

Cadabra is distributed in multiple formats to suit different needs:

### 1. Standalone Binaries (Recommended for Server)
Pre-compiled executables available via [GitHub Releases](https://github.com/SebastiaanWouters/cadabra/releases):
- No dependencies required (Bun is embedded)
- Fast startup and execution
- Cross-platform support (Linux, macOS, Windows, ARM64)
- Install via one-liner (see Installation section above)

### 2. NPM Package (For Library Usage)
```bash
npm install @sebastiaanwouters/cadabra
```
Use this for:
- Programmatic SQL analysis in your JavaScript/TypeScript projects
- Integrating cache key generation into your application
- **Note**: The NPM package is library-only; use binaries for the server

### 3. Docker Images
```bash
docker pull ghcr.io/sebastiaanwouters/cadabra:latest
```
Best for:
- Container orchestration (Kubernetes, Docker Compose)
- Cloud deployments
- Isolated server environments

### 4. PHP Client
See the separate [cadabra-php](https://github.com/SebastiaanWouters/cadabra-php) repository:
```bash
composer require cadabra/php
```
For Symfony/Doctrine integration with Cadabra server.

## Documentation

### Root Documentation
- [README.md](./README.md) - This file (quick start and overview)
- [CLAUDE.md](./CLAUDE.md) - Comprehensive development guide
- [PUBLISHING.md](./PUBLISHING.md) - Release and publishing workflows
- [CHANGELOG.md](./CHANGELOG.md) - Release history

### Package Documentation
- [packages/cadabra/README.md](./packages/cadabra/README.md) - TypeScript library usage
- [packages/cadabra/CLAUDE.md](./packages/cadabra/CLAUDE.md) - TypeScript package development

### PHP Client
- [cadabra-php repository](https://github.com/SebastiaanWouters/cadabra-php) - Separate repository for PHP/Symfony integration

## License

MIT - See [LICENSE](./LICENSE) for details
