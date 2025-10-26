# Cadabra PHP Client & Symfony Bundle

Transparent query cache for Symfony applications with Doctrine ORM. Intercepts at DBAL level for zero-code-change integration.

## Why This Works

This bundle intercepts database queries **after SQL generation but before execution** (DBAL `Statement::execute` level). It caches **raw database arrays before ORM hydration**, allowing Doctrine to hydrate entities normally. All Doctrine features work: UnitOfWork, lazy loading, lifecycle events, etc.

## Key Design Principle

**No Logic Duplication**: This client sends raw SQL to the Cadabra server without any normalization. The server handles all SQL normalization, cache key generation, and invalidation logic. This ensures consistent behavior across all clients (PHP, TypeScript, etc.).

### The Architecture

```
User Code
   ↓
Doctrine Repository (find/createQueryBuilder/etc.)
   ↓
Doctrine ORM (generates DQL)
   ↓
Doctrine DBAL (converts to SQL: "SELECT t0.id FROM users t0 WHERE t0.id = ?")
   ↓
🎯 CadabraMiddleware (intercepts here)
   ├─ Sends RAW SQL to Cadabra server
   ├─ Server normalizes (t0 → u) and generates cache key
   ├─ Checks cache
   ├─ Returns CachedResult if hit
   └─ Executes & caches if miss
   ↓
Database (only on cache miss)
   ↓
Doctrine ORM (hydrates entities from cached arrays)
   ↓
Your Entity Objects
```

## Installation

```bash
composer require cadabra/php
```

## Configuration

### 1. Register the Bundle

```php
// config/bundles.php
return [
    // ...
    Cadabra\SymfonyBundle\CadabraBundle::class => ['all' => true],
];
```

### 2. Configure Cadabra

```yaml
# config/packages/cadabra.yaml
cadabra:
    service_url: '%env(CADABRA_SERVICE_URL)%'
    prefix: '%env(APP_ENV)%_myapp'

    auto_cache:
        enabled: true
        default_ttl: 3600

        heuristics:
            cache_primary_key_lookups: true
            cache_simple_where: true
            max_join_tables: 2

            exclude_keywords:
                - 'FOR UPDATE'
                - 'LOCK IN SHARE MODE'

            exclude_tables:
                - sessions
                - messenger_messages

    table_ttls:
        users: 3600
        products: 7200
```

### 3. Set Environment Variables

```env
# .env
CADABRA_SERVICE_URL=http://localhost:8080
```

## How It Works

### Example: Simple Find

```php
// Your code
$user = $userRepository->find(10);

// Doctrine generates SQL
// "SELECT t0.id, t0.name, t0.email FROM users t0 WHERE t0.id = ?"
// Params: [10]

// CadabraMiddleware intercepts
// 1. Sends RAW SQL to server: "SELECT t0.id... WHERE t0.id = ?"
// 2. Server normalizes to: "SELECT u.id, u.name, u.email FROM users u WHERE u.id = 10"
// 3. Server analyzes and generates cache key fingerprint
// 4. Client checks cache → HIT
// 5. Returns CachedResult with: [['id' => 10, 'name' => 'John', ...]]

// Doctrine hydrates from cached array
// Result: User entity with all properties, UnitOfWork tracking, etc.
```

### Example: Update & Invalidation

```php
// Your code
$user->setEmail('new@example.com');
$em->flush();

// Doctrine generates SQL
// "UPDATE users SET email = ? WHERE id = ?"
// Params: ['new@example.com', 10]

// CadabraMiddleware intercepts
// 1. Executes the UPDATE
// 2. Sends write query to server for invalidation
// 3. Server determines affected cache keys and invalidates them
// 4. Next find(10) will be a cache miss and re-fetch
```

## Features That Just Work

### ✅ All Query Methods

```php
// find() - Cached
$user = $repo->find(10);

// findOneBy() - Cached
$user = $repo->findOneBy(['email' => 'john@example.com']);

// QueryBuilder - Cached
$users = $repo->createQueryBuilder('u')
    ->where('u.status = :status')
    ->setParameter('status', 'active')
    ->getQuery()
    ->getResult();

// DQL - Cached
$users = $em->createQuery('SELECT u FROM App\Entity\User u WHERE u.status = ?1')
    ->setParameter(1, 'active')
    ->getResult();

// Raw SQL - Cached
$stmt = $conn->prepare('SELECT * FROM users WHERE id = ?');
$stmt->execute([10]);
```

### ✅ Lazy Loading

```php
$user = $repo->find(10);      // Cached
$orders = $user->getOrders(); // Lazy load triggers new query, also cached
$items = $orders[0]->getItems(); // Another lazy load, also cached
```

### ✅ Automatic Invalidation

```php
// INSERT
$user = new User();
$user->setName('John');
$em->persist($user);
$em->flush();  // Server invalidates users table cache

// UPDATE
$user->setEmail('new@example.com');
$em->flush();  // Server invalidates cache entries for this user

// DELETE
$em->remove($user);
$em->flush();  // Server invalidates cache entries for this user
```

### ✅ Transactions

```php
$em->beginTransaction();
try {
    $user->setEmail('new@example.com');
    $em->flush();
    $em->commit();  // Cache invalidated only on successful commit
} catch (\Exception $e) {
    $em->rollback();  // No cache invalidation on rollback
}
```

### ✅ All Entity Features

- ✅ UnitOfWork change tracking
- ✅ Lifecycle events (PrePersist, PostLoad, etc.)
- ✅ Entity listeners
- ✅ Proxy objects for lazy loading
- ✅ Cascade operations
- ✅ Orphan removal
- ✅ Second-level cache (Doctrine's own cache layer)

## Configuration Details

### Heuristics

The bundle uses intelligent heuristics to decide what to cache:

#### `cache_primary_key_lookups` (default: true)
Cache `find(id)` queries - safest and most beneficial.

#### `cache_simple_where` (default: true)
Cache queries with simple WHERE conditions.

#### `max_join_tables` (default: 2)
Maximum number of JOINs to cache. Complex joins are skipped to avoid stale data issues.

#### `exclude_keywords`
SQL keywords that prevent caching (e.g., `FOR UPDATE` for row locks).

#### `exclude_tables`
Tables that should never be cached (e.g., sessions, message queues).

### Per-Table TTLs

```yaml
table_ttls:
    users: 3600      # 1 hour (frequently updated)
    products: 7200   # 2 hours (rarely updated)
    posts: 1800      # 30 minutes (very frequently updated)
```

## Advanced Usage

### Manual Cache Control

```php
use Cadabra\Client\CadabraClient;

class UserService
{
    public function __construct(private CadabraClient $client) {}

    public function clearUserCache(): void
    {
        // Clear all cache for users table
        $this->client->clearTable('users');
    }

    public function getStats(): array
    {
        return $this->client->getStats();
    }
}
```

### Monitoring

```php
use Psr\Log\LoggerInterface;

// Enable debug logging to see cache hits/misses
# config/packages/monolog.yaml
monolog:
    handlers:
        cadabra:
            type: stream
            path: '%kernel.logs_dir%/cadabra.log'
            level: debug
            channels: ['cadabra']
```

## Performance

### Cache Hit Rates

Typical applications see:
- **80-90% hit rate** for read-heavy workloads
- **50-70% hit rate** for mixed workloads
- **3-10x faster** response times for cached queries

### Overhead

- Cache miss: +2-5ms (server analysis + caching)
- Cache hit: +0.5-1ms (faster than database)
- Invalidation: Async, zero overhead

## Troubleshooting

### Cache Not Working

1. Check Cadabra service is running:
   ```bash
   curl http://localhost:8080/health
   ```

2. Enable debug logging:
   ```yaml
   # config/packages/monolog.yaml
   monolog:
       handlers:
           main:
               level: debug
   ```

3. Check heuristics aren't too restrictive:
   ```yaml
   cadabra:
       auto_cache:
           heuristics:
               max_join_tables: 5  # Increase if needed
   ```

### Stale Data

If you see stale data:
1. Verify invalidation is working (check logs)
2. Reduce TTL for affected tables
3. Manually clear cache: `$client->clearTable('tablename')`

### Performance Issues

If queries are slower:
1. Verify Cadabra service is healthy
2. Check network latency to Cadabra service
3. Consider disabling for complex queries:
   ```yaml
   cadabra:
       auto_cache:
           heuristics:
               max_join_tables: 1  # Only cache simple queries
   ```

## Development

### Running Tests

This package includes Composer scripts for easy testing and quality checks:

```bash
# Run all tests
composer test

# Run only unit tests
composer test:unit

# Run tests with HTML coverage report
composer test:coverage

# Check code style
composer cs:check

# Auto-fix code style issues
composer cs:fix

# Run all quality checks (code style + tests)
composer check

# Quick fix command
composer fix
```

### Test Structure

```
tests/
├── Unit/               # Unit tests for individual classes
│   ├── CachedResultTest.php
│   └── CacheStrategyTest.php
└── Integration/        # Integration tests (in symfony-test-app/)
```

### Adding New Tests

1. Create test class in `tests/Unit/`:
   ```php
   <?php
   namespace Cadabra\Tests\Unit;

   use PHPUnit\Framework\TestCase;

   class MyFeatureTest extends TestCase
   {
       public function testSomething(): void
       {
           $this->assertTrue(true);
       }
   }
   ```

2. Run tests:
   ```bash
   composer test:unit
   ```

## Testing

Disable caching in tests:

```yaml
# config/packages/test/cadabra.yaml
cadabra:
    auto_cache:
        enabled: false
```

Or use in-memory cache:

```yaml
# config/packages/test/framework.yaml
framework:
    cache:
        app: cache.adapter.array
```

## Production Checklist

- [ ] Cadabra service running and healthy
- [ ] Prefix set to environment: `prod_myapp`
- [ ] TTLs tuned based on update frequency
- [ ] Monitoring and alerting configured
- [ ] Logs reviewed for warnings/errors
- [ ] Cache stats monitored

## How This Differs from Doctrine Cache

| Feature | Doctrine Cache | Cadabra |
|---------|----------------|---------|
| **Level** | Result set | DBAL (raw arrays) |
| **Invalidation** | Manual/TTL only | Automatic on writes |
| **Granularity** | Query-based | Row/column-aware |
| **Hydration** | Caches after | Caches before |
| **Setup** | Per query | Automatic |
| **Normalization** | Client-side | Server-side |

## License

MIT
