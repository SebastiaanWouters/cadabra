# Cadabra

> Intelligent SQL query cache with automatic invalidation

Cadabra is a high-performance query caching system that automatically invalidates cached results when the underlying data changes. It analyzes SQL queries to generate stable cache keys and intelligently determines when to invalidate cache entries based on write operations.

## Features

- 🚀 **Blazing Fast**: Built on Bun for maximum performance
- 🧠 **Intelligent Analysis**: Automatic SQL query fingerprinting and classification
- ⚡ **Auto-Invalidation**: Automatically invalidates cache when data changes
- 🔌 **Multiple Integrations**: REST API server, PHP client, Symfony bundle
- 📊 **Prometheus Metrics**: Built-in metrics endpoint for monitoring
- 🐳 **Docker Ready**: Multi-platform Docker images available

## Installation

### As a Global CLI (requires Bun)

Install globally to get the `cadabra` command:

```bash
npm install -g cadabra
```

Then start the server:

```bash
cadabra
```

### As a Library

Install as a dependency in your project:

```bash
# npm
npm install cadabra

# bun
bun add cadabra

# pnpm
pnpm add cadabra

# yarn
yarn add cadabra
```

### One-Off Execution

Run without installing:

```bash
bunx cadabra
```

### Via Docker

```bash
docker pull ghcr.io/sebastiaanwouters/cadabra/cadabra:latest
docker run -p 6942:6942 ghcr.io/sebastiaanwouters/cadabra/cadabra:latest
```

## Runtime Compatibility

### Server (HTTP API)

**Requires Bun** - The server uses Bun-specific APIs (`bun:sqlite`, `Bun.serve`) for optimal performance.

- ✅ Bun 1.0+
- ❌ Node.js (server not compatible, use Docker instead)
- ❌ Deno (server not compatible, use Docker instead)

### Library (SQL Analysis Functions)

**Cross-Runtime Compatible** - The analysis functions work on all JavaScript runtimes:

- ✅ Bun 1.0+
- ✅ Node.js 18+
- ✅ Deno 1.30+

```typescript
// Works on Node.js, Deno, and Bun
import { analyzeSELECT, analyzeWrite } from 'cadabra';

const analysis = analyzeSELECT('SELECT * FROM users WHERE id = ?', [123]);
console.log(analysis.fingerprint); // Stable cache key
console.log(analysis.tables);      // ['users']
```

**Note**: The `CacheManager` class requires Bun due to `bun:sqlite` dependency.

## Usage

### Starting the Server

The server runs on port 6942 by default. Customize with environment variables:

```bash
# Default settings
cadabra

# Custom port and host
PORT=8080 HOST=localhost cadabra

# Production mode with minimal logging
LOG_LEVEL=warn cadabra

# Disable CORS
CORS_ENABLED=false cadabra
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `6942` | Server port |
| `HOST` | `0.0.0.0` | Server host |
| `LOG_LEVEL` | `info` | Logging level: `debug`, `info`, `warn`, `error` |
| `CORS_ENABLED` | `true` | Enable CORS headers |

### Using as a Library

#### Analyze SELECT Queries

```typescript
import { analyzeSELECT } from 'cadabra';

const result = analyzeSELECT(
  'SELECT * FROM users WHERE status = ? ORDER BY created_at',
  ['active']
);

console.log(result);
// {
//   fingerprint: "a1b2c3d4e5f6g7h8",
//   normalizedSQL: "SELECT * FROM users WHERE status = ? ORDER BY created_at",
//   tables: ["users"],
//   classification: "simple",
//   params: ["active"]
// }
```

#### Analyze Write Operations

```typescript
import { analyzeWrite } from 'cadabra';

const writeOp = analyzeWrite('UPDATE users SET status = ? WHERE id = ?', ['inactive', 123]);

console.log(writeOp);
// {
//   operation: "UPDATE",
//   table: "users",
//   affectedColumns: ["status"]
// }
```

#### Using CacheManager (Bun only)

```typescript
import { CacheManager } from 'cadabra';

const cache = new CacheManager();

// Register a query result
const analysis = cache.analyzeSELECT('SELECT * FROM products WHERE price < ?', [100]);
cache.register(analysis.fingerprint, resultData, analysis);

// Get cached result
const cached = cache.get(analysis.fingerprint);

// Invalidate on write
const writeInfo = cache.analyzeWrite('UPDATE products SET price = ? WHERE id = ?', [150, 5]);
cache.invalidate(writeInfo);

// Close database connection
cache.close();
```

### HTTP API

When running the server, you get a REST API:

#### Analyze Query

```bash
curl -X POST http://localhost:6942/analyze \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT * FROM users WHERE id = ?", "params": [123]}'
```

#### Register Cache Entry

```bash
curl -X POST http://localhost:6942/register \
  -H "Content-Type: application/json" \
  -d '{
    "sql": "SELECT * FROM users WHERE id = ?",
    "params": [123],
    "result": "base64-encoded-serialized-data"
  }'
```

#### Get Cached Result

```bash
curl http://localhost:6942/cache/a1b2c3d4e5f6g7h8
```

#### Invalidate Cache

```bash
curl -X POST http://localhost:6942/invalidate \
  -H "Content-Type: application/json" \
  -d '{"sql": "UPDATE users SET name = ? WHERE id = ?", "params": ["Alice", 123]}'
```

#### Health Check

```bash
curl http://localhost:6942/health
```

#### Metrics (Prometheus)

```bash
curl http://localhost:6942/metrics
```

#### Stats

```bash
curl http://localhost:6942/stats
```

## PHP Integration

Cadabra includes a PHP client and Symfony bundle for seamless integration:

```bash
composer require cadabra/php
```

See the [PHP documentation](https://github.com/yourusername/cadali/tree/main/packages/cadabra-php) for details.

## Performance

Cadabra provides significant performance improvements for complex queries:

- **Simple queries**: 0.0-1.1x speedup (network overhead)
- **Complex aggregates**: 12-15x speedup
- **Multi-table joins**: 249-739x speedup
- **Overall average**: 86x speedup

See our [benchmark results](https://github.com/yourusername/cadali/tree/main/packages/integration-tests) for detailed metrics.

## Development

### Running Tests

```bash
bun test
```

### Type Checking

```bash
bun run tsc
```

### Running in Dev Mode (with hot reload)

```bash
bun run dev
```

## Architecture

```
┌─────────────────────┐
│   Application       │
│   (PHP/JS/etc)      │
└──────────┬──────────┘
           │ HTTP
           ▼
┌─────────────────────┐
│   Cadabra Server    │
│   (Port 6942)       │
│                     │
│  ┌───────────────┐  │
│  │ SQL Analyzer  │  │
│  └───────────────┘  │
│  ┌───────────────┐  │
│  │ Cache Manager │  │
│  │  (SQLite)     │  │
│  └───────────────┘  │
│  ┌───────────────┐  │
│  │ REST API      │  │
│  └───────────────┘  │
└─────────────────────┘
```

## How It Works

1. **Query Analysis**: Cadabra parses SQL queries to extract tables, conditions, and generates a stable fingerprint
2. **Cache Storage**: Results are stored in SQLite with metadata about affected tables
3. **Smart Invalidation**: When a write operation occurs, Cadabra automatically invalidates relevant cache entries
4. **REST API**: Simple HTTP interface for cache operations

## Cache Key Generation

Cadabra generates stable cache keys by:

1. Parsing SQL into an Abstract Syntax Tree (AST)
2. Normalizing the query (parameters, whitespace, case)
3. Extracting semantic information (tables, columns, conditions)
4. Generating a SHA-256 hash of the normalized structure

This ensures:
- ✅ Same query = same cache key
- ✅ Different parameter values = same cache key (WHERE id = 1 or WHERE id = 2)
- ✅ Whitespace/formatting changes = same cache key
- ✅ Semantic changes = different cache key

## License

MIT

## Contributing

Contributions welcome! See [CONTRIBUTING.md](https://github.com/yourusername/cadali/blob/main/CONTRIBUTING.md) for guidelines.

## Links

- [Documentation](https://github.com/yourusername/cadali)
- [PHP Client](https://github.com/yourusername/cadali/tree/main/packages/cadabra-php)
- [Issues](https://github.com/yourusername/cadali/issues)
- [NPM Package](https://www.npmjs.com/package/cadabra)
- [Docker Image](https://github.com/yourusername/cadali/pkgs/container/cadali%2Fcadabra)
