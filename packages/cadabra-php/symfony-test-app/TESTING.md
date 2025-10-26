# Testing Guide

Comprehensive guide for testing the Cadabra Symfony Bundle integration.

## Table of Contents

1. [Test Environment Setup](#test-environment-setup)
2. [Test Structure](#test-structure)
3. [Writing Tests](#writing-tests)
4. [Running Tests](#running-tests)
5. [Benchmarking](#benchmarking)
6. [CI/CD Integration](#cicd-integration)
7. [Troubleshooting](#troubleshooting)

## Test Environment Setup

### Local Setup

```bash
# 1. Install dependencies
composer install

# 2. Start Cadabra server (in separate terminal)
cd ../../cadabra
bun server.ts

# 3. Set up test database
./bin/setup.sh

# 4. Run tests
./bin/test.sh
```

### Docker Setup

```bash
# One-command setup and test
./bin/docker-test.sh
```

## Test Structure

### Base Test Case

All tests extend `BaseTestCase`, which provides:

- Automatic database schema creation
- Transaction-based test isolation
- Entity manager management
- Helper methods

```php
abstract class BaseTestCase extends KernelTestCase
{
    protected EntityManagerInterface $entityManager;

    protected function setUp(): void
    {
        parent::setUp();
        self::bootKernel();
        $this->entityManager = static::getContainer()->get(EntityManagerInterface::class);

        if (!self::$schemaCreated) {
            $this->createDatabaseSchema();
            self::$schemaCreated = true;
        }

        $this->entityManager->beginTransaction();
    }

    protected function tearDown(): void
    {
        if ($this->entityManager->getConnection()->isTransactionActive()) {
            $this->entityManager->rollback();
        }
        $this->entityManager->close();
        parent::tearDown();
    }

    protected function refreshEntityManager(): void
    {
        $this->entityManager->clear();
    }
}
```

### Test Suites

#### 1. Cache Functionality Tests

Location: `tests/Integration/CacheFunctionalityTest.php`

**Purpose:** Verify caching behavior

**Tests:**
- `testSimpleQueryCacheMissOnFirstQuery()` - First query should fetch from DB
- `testSimpleQueryCacheHitOnRepeatedQuery()` - Repeated query should use cache
- `testCacheInvalidationOnInsert()` - INSERT should invalidate cache
- `testCacheInvalidationOnUpdate()` - UPDATE should invalidate cache
- `testCacheInvalidationOnDelete()` - DELETE should invalidate cache
- `testJoinQueryCaching()` - JOIN queries should be cached
- `testAggregateQueryCaching()` - Aggregate queries should be cached
- `testMultiTableInvalidation()` - Changes should invalidate related tables
- `testPaginatedQueryCaching()` - Each page should be cached separately
- `testParameterizedQueryCaching()` - Different parameters = different cache

**Example:**

```php
public function testSimpleQueryCacheHitOnRepeatedQuery(): void
{
    // First query - cache MISS
    $user1 = $this->userRepository->findByEmail('user2@test.com');
    $this->assertNotNull($user1);

    // Clear entity manager to ensure fresh fetch
    $this->refreshEntityManager();

    // Second identical query - should be cache HIT
    $user2 = $this->userRepository->findByEmail('user2@test.com');
    $this->assertNotNull($user2);
    $this->assertEquals($user1->getId(), $user2->getId());
}
```

#### 2. Doctrine ORM Integration Tests

Location: `tests/Integration/DoctrineORMIntegrationTest.php`

**Purpose:** Verify ORM functionality works correctly with caching

**Tests:**
- `testEntityCRUDOperations()` - Create, Read, Update, Delete
- `testLazyLoadingRelationships()` - Lazy loading triggers additional queries
- `testEagerLoadingWithJoins()` - Eager loading reduces queries
- `testComplexJoinQuery()` - Multi-table JOINs work correctly
- `testDQLQuery()` - DQL queries are cached
- `testAggregateQueries()` - COUNT, SUM, GROUP BY work correctly
- `testRepositoryCustomMethods()` - Custom repository methods work
- `testCascadeOperations()` - Cascade persist/remove work
- `testBidirectionalRelationships()` - Both sides of relationships work
- `testQueryBuilder()` - Query Builder API works correctly
- `testPartialObjectQueries()` - Partial selects work
- `testNativeSQL()` - Native SQL queries work

**Example:**

```php
public function testEagerLoadingWithJoins(): void
{
    // Eager load with explicit JOIN
    $products = $this->productRepository->findWithCategory(3);
    $this->assertCount(3, $products);

    // Category should be loaded without additional query
    foreach ($products as $product) {
        $this->assertNotNull($product->getCategory());
        $this->assertNotNull($product->getCategory()->getName());
    }
}
```

#### 3. Edge Cases and Error Handling

Location: `tests/Integration/EdgeCasesAndErrorHandlingTest.php`

**Purpose:** Test unusual scenarios and edge cases

**Tests:**
- `testEmptyResultSet()` - Queries returning no results
- `testLargeResultSet()` - Handling 1000+ records
- `testNullAndEmptyValues()` - NULL/empty field handling
- `testSpecialCharactersInData()` - Quotes, newlines, Unicode, SQL injection
- `testConcurrentModifications()` - Multiple simultaneous reads
- `testBoundaryValues()` - Min/max values
- `testComplexQueryWithNoResults()` - Complex queries with empty results
- `testQueryWithManyParameters()` - Multiple parameter binding
- `testRepeatedIdenticalQueries()` - Same query executed many times
- `testDateTimeHandling()` - Date/time comparisons
- `testTransactionRollback()` - Transaction isolation
- `testVeryLongStrings()` - Maximum length strings

#### 4. Performance Benchmarks

Location: `tests/Benchmark/PerformanceBenchmarkTest.php`

**Purpose:** Measure query performance with caching

**Constants:**
- `BENCHMARK_ITERATIONS = 100` - Number of times to run each query
- `WARMUP_ITERATIONS = 5` - Warmup runs before benchmarking

**Tests:**
- `testSimpleRowLookupPerformance()` - Single row by ID/email
- `testJoinQueryPerformance()` - Two-table JOIN
- `testComplexMultiTableJoinPerformance()` - 3+ table JOIN
- `testAggregateQueryPerformance()` - GROUP BY, COUNT, AVG
- `testPaginationPerformance()` - LIMIT/OFFSET queries
- `testSearchQueryPerformance()` - LIKE queries
- `testCacheHitRatio()` - Repeated identical queries
- `testBulkInsertPerformance()` - Multiple INSERTs
- `testComplexAggregatePerformance()` - Complex analytics queries
- `testConcurrentReadPerformance()` - Parallel reads

**Example:**

```php
public function testSimpleRowLookupPerformance(): void
{
    echo "\n=== Benchmarking Simple Row Lookup ===\n";

    // Warmup
    for ($i = 0; $i < self::WARMUP_ITERATIONS; $i++) {
        $this->userRepository->findByEmail("benchmark{$i}@test.com");
        $this->refreshEntityManager();
    }

    // Benchmark
    $startTime = microtime(true);
    for ($i = 0; $i < self::BENCHMARK_ITERATIONS; $i++) {
        $this->userRepository->findByEmail("benchmark{$i}@test.com");
        $this->refreshEntityManager();
    }
    $endTime = microtime(true);

    $totalTime = ($endTime - $startTime) * 1000;
    $avgTime = $totalTime / self::BENCHMARK_ITERATIONS;

    echo sprintf("Total time: %.2f ms\n", $totalTime);
    echo sprintf("Average time per query: %.2f ms\n", $avgTime);
    echo sprintf("Queries per second: %.2f\n", 1000 / $avgTime);

    $this->assertLessThan(100, $avgTime);
}
```

## Writing Tests

### Best Practices

1. **Always call `refreshEntityManager()`** between queries to avoid entity manager caching:

```php
$user1 = $this->userRepository->find(1);
$this->refreshEntityManager(); // Clear entity manager
$user2 = $this->userRepository->find(1); // Fresh query
```

2. **Use transactions for isolation** - Tests automatically run in transactions and rollback

3. **Create minimal test data** - Only create what you need for each test:

```php
private function setupTestData(): void
{
    $user = new User();
    $user->setName('Test User');
    $user->setEmail('test@example.com');
    $this->entityManager->persist($user);
    $this->entityManager->flush();
    $this->entityManager->clear();
}
```

4. **Test both positive and negative cases**:

```php
// Positive: user exists
$user = $this->userRepository->findByEmail('existing@test.com');
$this->assertNotNull($user);

// Negative: user doesn't exist
$user = $this->userRepository->findByEmail('nonexistent@test.com');
$this->assertNull($user);
```

5. **Use descriptive test names** that explain what is being tested

6. **Assert meaningful conditions**:

```php
// Good
$this->assertEquals('John Doe', $user->getName());
$this->assertGreaterThan(0, $user->getId());

// Less useful
$this->assertTrue(true);
```

### Common Patterns

#### Testing Cache Invalidation

```php
public function testCacheInvalidationOnUpdate(): void
{
    // Query and cache
    $user = $this->userRepository->findByEmail('test@example.com');
    $this->assertEquals('Original Name', $user->getName());

    // Modify
    $user->setName('Updated Name');
    $this->entityManager->flush();

    // Re-query (should get updated data)
    $this->refreshEntityManager();
    $updatedUser = $this->userRepository->findByEmail('test@example.com');
    $this->assertEquals('Updated Name', $updatedUser->getName());
}
```

#### Testing Relationships

```php
public function testRelationshipLoading(): void
{
    $user = $this->userRepository->find(1);

    // Test lazy loading
    $orders = $user->getOrders();
    $this->assertInstanceOf(Collection::class, $orders);
    $this->assertCount(2, $orders);

    // Test relationship data
    $order = $orders->first();
    $this->assertEquals($user->getId(), $order->getUser()->getId());
}
```

#### Testing Aggregate Queries

```php
public function testAggregateQuery(): void
{
    $result = $this->productRepository->getAveragePriceByCategory();

    $this->assertIsArray($result);
    $this->assertNotEmpty($result);

    foreach ($result as $row) {
        $this->assertArrayHasKey('category_name', $row);
        $this->assertArrayHasKey('avg_price', $row);
        $this->assertArrayHasKey('product_count', $row);
    }
}
```

## Running Tests

### All Tests

```bash
./bin/test.sh
```

### Specific Test Suite

```bash
./bin/test.sh --testsuite "Integration Tests"
./bin/test.sh --testsuite "Benchmark Tests"
```

### Single Test Method

```bash
./bin/test.sh --filter testCacheHit
```

### Single Test Class

```bash
vendor/bin/phpunit tests/Integration/CacheFunctionalityTest.php
```

### Verbose Output

```bash
./bin/test.sh --verbose
```

### In Docker

```bash
docker-compose exec symfony-app ./bin/test.sh
```

## Benchmarking

### Running Benchmarks

```bash
# Local
./bin/benchmark.sh

# Docker
docker-compose exec symfony-app ./bin/benchmark.sh
```

### Comparing With/Without Cache

1. **With cache enabled** (default):

```bash
# In .env
CADABRA_ENABLED=true

./bin/benchmark.sh
```

2. **Without cache**:

```bash
# In .env
CADABRA_ENABLED=false

./bin/benchmark.sh
```

3. **Compare results** to see caching impact

### Understanding Benchmark Output

```
=== Benchmarking Simple Row Lookup ===
Total time: 245.32 ms
Average time per query: 2.45 ms
Queries per second: 408.16
```

- **Total time**: Sum of all iterations
- **Average time**: Total ÷ iterations
- **QPS**: 1000 ÷ average time

### Performance Targets

| Query Type | Target Avg (Cached) | Target Avg (Uncached) |
|------------|--------------------:|----------------------:|
| Row lookup | < 5ms | < 20ms |
| Simple JOIN | < 10ms | < 50ms |
| Complex JOIN | < 20ms | < 100ms |
| Aggregate | < 30ms | < 150ms |

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v2

      - name: Build and test
        run: |
          cd packages/cadabra-php/symfony-test-app
          ./bin/docker-test.sh
```

### GitLab CI Example

```yaml
test:
  image: php:8.2-cli
  services:
    - name: cadabra-server
  script:
    - cd packages/cadabra-php/symfony-test-app
    - ./bin/setup.sh
    - ./bin/test.sh
```

## Troubleshooting

### Tests Are Slow

1. **Check if Cadabra is running**:
   ```bash
   curl http://localhost:6942/health
   ```

2. **Verify cache is enabled**:
   ```bash
   grep CADABRA_ENABLED .env
   ```

3. **Check cache hit ratio**:
   ```bash
   curl http://localhost:6942/stats
   ```

### Cache Not Working

1. **Verify server URL is correct**:
   ```bash
   echo $CADABRA_SERVER_URL
   ```

2. **Check network connectivity**:
   ```bash
   docker-compose exec symfony-app curl http://cadabra-server:6942/health
   ```

3. **Check logs**:
   ```bash
   docker-compose logs cadabra-server
   ```

### Database Errors

1. **Reset database**:
   ```bash
   rm -f var/data.db
   ./bin/setup.sh
   ```

2. **Check permissions**:
   ```bash
   ls -la var/
   chmod -R 777 var/
   ```

### Memory Issues

1. **Increase PHP memory**:
   ```bash
   php -d memory_limit=512M vendor/bin/phpunit
   ```

2. **Reduce fixture size** in `AppFixtures.php`

### Transaction Issues

If you see "There is no active transaction":

```php
// Ensure you're not flushing outside a transaction
protected function setUp(): void
{
    parent::setUp();
    $this->entityManager->beginTransaction();
}
```

## Advanced Topics

### Custom Assertions

```php
protected function assertCacheHit(): void
{
    // Check Cadabra metrics
    $stats = file_get_contents('http://localhost:6942/stats');
    $data = json_decode($stats, true);
    $this->assertGreaterThan(0, $data['cache_hits']);
}
```

### Profiling Queries

```php
use Doctrine\DBAL\Logging\DebugStack;

$debugStack = new DebugStack();
$this->entityManager->getConnection()
    ->getConfiguration()
    ->setSQLLogger($debugStack);

// Execute query
$this->userRepository->findAll();

// Check queries
$this->assertCount(1, $debugStack->queries);
```

### Testing Cache TTL

```php
public function testCacheTTL(): void
{
    // Query and cache
    $user = $this->userRepository->find(1);

    // Wait for TTL to expire
    sleep(301); // Assuming 300s TTL

    // Query again - should be cache MISS
    $this->refreshEntityManager();
    $user = $this->userRepository->find(1);
}
```

## Resources

- [PHPUnit Documentation](https://phpunit.de/documentation.html)
- [Doctrine Testing Guide](https://www.doctrine-project.org/projects/doctrine-orm/en/latest/reference/testing.html)
- [Symfony Testing](https://symfony.com/doc/current/testing.html)
- [Cadabra Documentation](../../README.md)
