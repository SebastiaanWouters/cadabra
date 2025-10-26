# Testing Guide for Cadabra PHP

Comprehensive guide for testing the Cadabra PHP client and Symfony bundle.

---

## Quick Start

```bash
# Install dependencies
composer install

# Run all tests
composer test

# Run all quality checks (tests + code style)
composer check
```

---

## Available Commands

### Testing Commands

```bash
# Run all PHPUnit tests (unit + integration)
composer test

# Run only unit tests (fast, no dependencies)
composer test:unit

# Run tests with HTML coverage report
composer test:coverage
# Opens: coverage/index.html
```

### Code Style Commands

```bash
# Check code style (dry-run, shows issues)
composer cs:check

# Auto-fix code style issues
composer cs:fix
```

### Combined Commands

```bash
# Run all quality checks (code style + tests)
composer check

# Auto-fix code style issues (alias for cs:fix)
composer fix
```

---

## Test Structure

```
packages/cadabra-php/
├── tests/
│   └── Unit/                    # Unit tests (no external dependencies)
│       ├── CachedResultTest.php
│       └── CacheStrategyTest.php
│
└── symfony-test-app/
    └── tests/                   # Integration tests (full stack)
        ├── Integration/
        │   ├── CacheFunctionalityTest.php
        │   ├── DoctrineORMIntegrationTest.php
        │   └── EdgeCasesAndErrorHandlingTest.php
        ├── Benchmark/
        │   └── PerformanceBenchmarkTest.php
        └── BaseTestCase.php
```

---

## Running Specific Tests

### Unit Tests

```bash
# All unit tests
composer test:unit

# Specific test file
vendor/bin/phpunit tests/Unit/CacheStrategyTest.php

# Specific test method
vendor/bin/phpunit --filter testShouldCacheSimpleQuery
```

### Integration Tests

Integration tests require the Cadabra server to be running:

```bash
# 1. Start Cadabra server (in separate terminal)
cd ../../cadabra
bun run server.ts

# 2. Run integration tests
cd ../cadabra-php/symfony-test-app
vendor/bin/phpunit

# Or run specific test suite
vendor/bin/phpunit tests/Integration/CacheFunctionalityTest.php
```

### Benchmark Tests

```bash
cd symfony-test-app
vendor/bin/phpunit tests/Benchmark/
```

---

## Writing Tests

### Unit Test Example

```php
<?php

namespace Cadabra\Tests\Unit;

use PHPUnit\Framework\TestCase;
use Cadabra\SymfonyBundle\Service\CacheStrategy;

class CacheStrategyTest extends TestCase
{
    private CacheStrategy $strategy;

    protected function setUp(): void
    {
        $this->strategy = new CacheStrategy([
            'enabled' => true,
            'heuristics' => [
                'max_join_tables' => 3,
            ],
        ]);
    }

    public function testShouldCacheSimpleQuery(): void
    {
        $sql = "SELECT * FROM users WHERE id = 1";

        $result = $this->strategy->shouldCache($sql);

        $this->assertTrue($result);
    }

    public function testShouldNotCacheComplexJoin(): void
    {
        $sql = "SELECT * FROM a JOIN b JOIN c JOIN d JOIN e";

        $result = $this->strategy->shouldCache($sql);

        $this->assertFalse($result);
    }
}
```

### Integration Test Example

```php
<?php

namespace App\Tests\Integration;

use App\Tests\BaseTestCase;

class CacheFunctionalityTest extends BaseTestCase
{
    public function testSimpleQueryCacheMissOnFirstQuery(): void
    {
        // Clear cache
        $this->clearCache();

        // First query - cache miss
        $user = $this->em->getRepository(User::class)->find(1);

        $this->assertInstanceOf(User::class, $user);

        // Check cache was populated
        $stats = $this->cadabraClient->getStats();
        $this->assertGreaterThan(0, $stats['cache_misses']);
    }

    public function testSimpleQueryCacheHitOnRepeatedQuery(): void
    {
        // First query
        $user1 = $this->em->getRepository(User::class)->find(1);

        // Clear entity manager to force new query
        $this->em->clear();

        // Second query - cache hit
        $user2 = $this->em->getRepository(User::class)->find(1);

        $this->assertEquals($user1->getId(), $user2->getId());

        // Verify cache hit
        $stats = $this->cadabraClient->getStats();
        $this->assertGreaterThan(0, $stats['cache_hits']);
    }
}
```

---

## Test Coverage

### Generating Coverage Reports

```bash
# HTML coverage report
composer test:coverage

# Open in browser
open coverage/index.html   # macOS
xdg-open coverage/index.html   # Linux
```

### Coverage Configuration

Coverage settings are configured in `phpunit.xml.dist`:

```xml
<source>
    <include>
        <directory suffix=".php">src</directory>
    </include>
</source>
```

---

## Continuous Integration

Tests run automatically in GitHub Actions on every push and PR.

### CI Workflow

```yaml
# .github/workflows/ci.yml
- name: Run PHP code style check
  run: composer cs:check

- name: Run PHPUnit unit tests
  run: composer test:unit
```

### Matrix Testing

Tests run across:
- PHP: 8.1, 8.2, 8.3, 8.4
- Symfony: 6.0, 7.0
- Total: 7 combinations

---

## Code Style

### PHP CS Fixer Configuration

Configuration is in `.php-cs-fixer.dist.php`:

```php
<?php

$finder = PhpCsFixer\Finder::create()
    ->in(__DIR__ . '/src')
    ->in(__DIR__ . '/tests');

return (new PhpCsFixer\Config())
    ->setRules([
        '@PSR12' => true,
        '@Symfony' => true,
        // ... additional rules
    ])
    ->setFinder($finder);
```

### Checking Code Style

```bash
# Check without making changes
composer cs:check

# See what would be fixed
composer cs:check

# Auto-fix issues
composer cs:fix
```

---

## Debugging Tests

### Enable Debug Output

```bash
# Verbose output
vendor/bin/phpunit --verbose

# Debug mode (even more verbose)
vendor/bin/phpunit --debug

# Stop on failure
vendor/bin/phpunit --stop-on-failure

# Stop on error
vendor/bin/phpunit --stop-on-error
```

### Using var_dump in Tests

```php
public function testDebugExample(): void
{
    $result = $this->someMethod();

    // This will show in test output
    var_dump($result);

    $this->assertTrue($result->isValid());
}
```

### Test Isolation

Each test should be isolated:

```php
protected function setUp(): void
{
    // Runs before each test
    $this->clearCache();
    $this->resetDatabase();
}

protected function tearDown(): void
{
    // Runs after each test
    $this->cleanupResources();
}
```

---

## Common Issues

### "Class not found" errors

```bash
# Regenerate autoloader
composer dump-autoload
```

### Tests fail with connection errors

```bash
# Ensure Cadabra server is running
cd ../../cadabra
bun run server.ts

# Check server health
curl http://localhost:6942/health
```

### Cache directory permissions

The test bootstrap automatically handles this:

```php
// tests/bootstrap.php
$filesystem = new Filesystem();
$varDir = dirname(__DIR__).'/var';
if (!$filesystem->exists($varDir) || !is_writable($varDir)) {
    $tmpVarDir = sys_get_temp_dir().'/symfony-test-app-'.md5(__DIR__);
    $filesystem->mkdir($tmpVarDir);
    // ...
}
```

### PHPUnit version conflicts

Ensure PHPUnit 10+ is installed:

```bash
composer require --dev phpunit/phpunit:^10.0
```

---

## Best Practices

### 1. Test Naming

```php
// ✅ Good - Describes what is tested
public function testShouldCacheSimpleSelectQuery(): void

// ❌ Bad - Vague
public function testCache(): void
```

### 2. Arrange-Act-Assert

```php
public function testCacheInvalidationOnUpdate(): void
{
    // Arrange
    $user = $this->createTestUser();
    $this->em->persist($user);
    $this->em->flush();

    // Act
    $user->setName('Updated Name');
    $this->em->flush();

    // Assert
    $this->assertCacheWasInvalidated('users');
}
```

### 3. Use Data Providers

```php
/**
 * @dataProvider simpleQueryProvider
 */
public function testShouldCacheSimpleQueries(string $sql): void
{
    $result = $this->strategy->shouldCache($sql);
    $this->assertTrue($result);
}

public static function simpleQueryProvider(): array
{
    return [
        ['SELECT * FROM users WHERE id = 1'],
        ['SELECT name FROM products WHERE slug = "foo"'],
        ['SELECT COUNT(*) FROM orders WHERE status = "pending"'],
    ];
}
```

### 4. Test One Thing

```php
// ✅ Good - Tests one aspect
public function testCacheHitOnRepeatedQuery(): void
{
    $this->executeQuery($sql);
    $this->executeQuery($sql);
    $this->assertCacheHit();
}

// ❌ Bad - Tests multiple things
public function testCaching(): void
{
    $this->testCacheMiss();
    $this->testCacheHit();
    $this->testInvalidation();
}
```

---

## Performance

### Fast Unit Tests

Unit tests should be fast (< 100ms each):

```bash
# Run with timing
vendor/bin/phpunit --testdox

# Example output:
✔ Should cache simple query (2 ms)
✔ Should not cache complex join (1 ms)
✔ Should respect max join tables config (3 ms)
```

### Slow Integration Tests

Integration tests can be slower but should still be reasonable:

```bash
# Mark slow tests
/**
 * @group slow
 */
public function testComplexIntegrationScenario(): void
{
    // ...
}

# Skip slow tests during development
vendor/bin/phpunit --exclude-group slow
```

---

## CI/CD Integration

### Pre-commit Checks

While git hooks are not used, you can run checks manually:

```bash
# Before committing
composer check

# This runs:
# - composer cs:check (code style)
# - composer test:unit (unit tests)
```

### Release Checks

The release script automatically runs:

```bash
./scripts/release.sh 1.0.0

# Runs:
# 1. composer cs:check
# 2. composer test:unit
# 3. TypeScript tests
# 4. Creates release if all pass
```

---

## Additional Resources

- [PHPUnit Documentation](https://phpunit.de/documentation.html)
- [Symfony Testing Guide](https://symfony.com/doc/current/testing.html)
- [PHP CS Fixer Documentation](https://github.com/PHP-CS-Fixer/PHP-CS-Fixer)
- [Doctrine Testing](https://www.doctrine-project.org/projects/doctrine-orm/en/latest/reference/testing.html)

---

## Summary

**Quick commands for daily development:**

```bash
# Check everything
composer check

# Fix code style
composer fix

# Run tests
composer test

# Before committing
composer check && echo "✅ Ready to commit!"
```

**Remember:**
- ✅ Write tests for all new features
- ✅ Run `composer check` before committing
- ✅ Keep tests fast and isolated
- ✅ Use meaningful test names
- ✅ One assertion per test (when possible)
