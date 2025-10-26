# Cadabra Symfony Test Application

A comprehensive test application and benchmark suite for the Cadabra Symfony Bundle, demonstrating integration with Doctrine ORM and SQLite.

## Overview

This application serves as:
- **Integration testing environment** for the Cadabra Symfony Bundle
- **Performance benchmarking suite** for query caching capabilities
- **Reference implementation** showing best practices for Cadabra integration

## Features

- Full Symfony 7.0 application with Doctrine ORM
- SQLite database with realistic e-commerce schema
- Comprehensive test data (10,000 users, 5,000 products, 50,000 orders, 25,000 reviews)
- Complete integration test suite covering:
  - Cache functionality (hits, misses, invalidation)
  - Doctrine ORM operations (CRUD, relationships, DQL)
  - Edge cases and error handling
  - Performance benchmarks
- Docker Compose setup with Cadabra server
- Helper scripts for easy setup and testing

## Quick Start

### Docker (Recommended)

```bash
# Start services and run all tests
./bin/docker-test.sh
```

This will:
1. Build Docker images
2. Start Cadabra server and Symfony app
3. Set up database and load fixtures
4. Run integration tests
5. Run performance benchmarks

### Local Development

**Prerequisites:**
- PHP 8.2+
- Composer
- SQLite extension
- Cadabra server running on port 6942

**Setup:**

```bash
# Install dependencies and set up database
./bin/setup.sh

# Run tests
./bin/test.sh

# Run benchmarks
./bin/benchmark.sh
```

## Architecture

### Directory Structure

```
symfony-test-app/
├── bin/
│   ├── console              # Symfony console
│   ├── setup.sh             # Setup script
│   ├── test.sh              # Test runner
│   ├── benchmark.sh         # Benchmark runner
│   └── docker-test.sh       # Docker test suite
├── config/
│   ├── bundles.php          # Bundle registration
│   ├── packages/            # Bundle configurations
│   └── services.yaml        # Service definitions
├── src/
│   ├── Entity/              # Doctrine entities
│   ├── Repository/          # Custom repositories
│   └── DataFixtures/        # Test data generators
├── tests/
│   ├── BaseTestCase.php     # Base test class
│   ├── Integration/         # Integration tests
│   └── Benchmark/           # Performance benchmarks
├── var/                     # Cache and database
├── docker-compose.yml       # Docker orchestration
├── Dockerfile               # Application container
└── phpunit.xml.dist         # PHPUnit configuration
```

### Database Schema

The application uses an e-commerce schema:

- **users** (10,000 records): User accounts
- **categories** (50 records): Product categories
- **products** (5,000 records): Product catalog
- **orders** (50,000 records): Customer orders
- **order_items** (~150,000 records): Line items
- **reviews** (25,000 records): Product reviews

## Testing

### Running Tests

```bash
# All integration tests
./bin/test.sh

# Specific test suite
./bin/test.sh --testsuite "Integration Tests"

# Filter by test name
./bin/test.sh --filter testCacheHit

# Verbose output
./bin/test.sh --verbose
```

### Test Suites

1. **Cache Functionality Tests** (`CacheFunctionalityTest.php`)
   - Cache MISS on first query
   - Cache HIT on repeated queries
   - Invalidation on INSERT/UPDATE/DELETE
   - Multi-table invalidation
   - Paginated query caching
   - Parameterized query caching

2. **Doctrine ORM Integration Tests** (`DoctrineORMIntegrationTest.php`)
   - CRUD operations
   - Lazy/eager loading
   - Complex JOIN queries
   - DQL and Query Builder
   - Aggregate queries
   - Cascade operations
   - Bidirectional relationships

3. **Edge Cases and Error Handling** (`EdgeCasesAndErrorHandlingTest.php`)
   - Empty result sets
   - Large result sets
   - Special characters
   - Boundary values
   - Concurrent modifications
   - Transaction rollback

4. **Performance Benchmarks** (`PerformanceBenchmarkTest.php`)
   - Simple row lookup performance
   - JOIN query performance
   - Aggregate query performance
   - Pagination performance
   - Cache hit ratio analysis
   - Bulk insert performance

## Benchmarking

### Running Benchmarks

```bash
# Run all benchmarks
./bin/benchmark.sh

# In Docker
docker-compose exec symfony-app ./bin/benchmark.sh
```

### Benchmark Metrics

Each benchmark measures:
- Total execution time
- Average time per query
- Queries per second
- Cache hit ratio (where applicable)

Example output:
```
=== Benchmarking Simple Row Lookup ===
Total time: 245.32 ms
Average time per query: 2.45 ms
Queries per second: 408.16
```

### Interpreting Results

- **< 10ms**: Excellent performance (likely cached)
- **10-50ms**: Good performance
- **50-100ms**: Acceptable performance
- **> 100ms**: May need optimization

Compare results with/without Cadabra to measure caching effectiveness.

## Docker Usage

### Services

The `docker-compose.yml` defines two services:

1. **cadabra-server**: Cache server (port 6942)
2. **symfony-app**: Test application

### Commands

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Execute commands in symfony-app
docker-compose exec symfony-app php bin/console

# Run tests in container
docker-compose exec symfony-app ./bin/test.sh

# View Cadabra stats
docker-compose exec cadabra-server curl http://localhost:6942/stats

# Stop services
docker-compose down
```

### Environment Variables

Configure via `.env.docker`:

```env
# Symfony
APP_ENV=test
APP_DEBUG=0

# Database
DATABASE_URL=sqlite:///%kernel.project_dir%/var/data.db

# Cadabra
CADABRA_SERVER_URL=http://cadabra-server:6942
CADABRA_ENABLED=true
CADABRA_TIMEOUT=5
```

## Configuration

### Cadabra Bundle Configuration

See `config/packages/cadabra.yaml`:

```yaml
cadabra:
    server_url: '%env(CADABRA_SERVER_URL)%'
    enabled: '%env(bool:CADABRA_ENABLED)%'
    timeout: '%env(int:CADABRA_TIMEOUT)%'
    cache_strategy:
        row_lookup_ttl: 300      # 5 minutes
        aggregate_ttl: 60        # 1 minute
        join_ttl: 180            # 3 minutes
        complex_ttl: 120         # 2 minutes
```

### PHPUnit Configuration

See `phpunit.xml.dist`:

- Bootstrap: `tests/bootstrap.php`
- Test suites: Integration Tests, Benchmark Tests
- Environment: APP_ENV=test

## Development

### Adding New Tests

1. Create test class extending `BaseTestCase`
2. Use `setupTestData()` to create fixtures
3. Use `refreshEntityManager()` to clear cache between queries
4. Add assertions for expected behavior

Example:

```php
use App\Tests\BaseTestCase;

class MyIntegrationTest extends BaseTestCase
{
    public function testSomething(): void
    {
        // Create test data
        $user = new User();
        $user->setName('Test');
        $this->entityManager->persist($user);
        $this->entityManager->flush();

        // Query and assert
        $this->refreshEntityManager();
        $found = $this->userRepository->find($user->getId());
        $this->assertNotNull($found);
    }
}
```

### Adding New Fixtures

Edit `src/DataFixtures/AppFixtures.php`:

```php
private function createMyData(ObjectManager $manager, int $count): void
{
    for ($i = 0; $i < $count; $i++) {
        $entity = new MyEntity();
        // Set properties
        $manager->persist($entity);
    }
    $manager->flush();
}
```

## Troubleshooting

### Cadabra Server Not Running

```bash
# Start locally
cd ../../../cadabra
bun server.ts

# Or via Docker
docker-compose up -d cadabra-server
```

### Database Issues

```bash
# Reset database
rm -f var/data.db
./bin/setup.sh
```

### Permission Issues

```bash
# Fix var directory permissions
chmod -R 777 var/
```

### Tests Failing

```bash
# Clear cache and reset
rm -rf var/cache/*
php bin/console cache:clear
./bin/setup.sh
```

## Performance Tips

1. **Use pagination** for large result sets
2. **Eager load relationships** to avoid N+1 queries
3. **Monitor cache hit ratio** via Cadabra stats endpoint
4. **Adjust TTL values** in `cadabra.yaml` based on data volatility
5. **Batch operations** when inserting/updating many records

## Further Reading

- [Cadabra Documentation](../../README.md)
- [Symfony Bundle Guide](../README.md)
- [Testing Guide](TESTING.md)
- [Doctrine ORM Documentation](https://www.doctrine-project.org/projects/doctrine-orm/en/latest/)

## License

MIT
