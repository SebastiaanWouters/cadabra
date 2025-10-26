<?php

declare(strict_types=1);

namespace Cadabra\Tests\Unit;

use Cadabra\SymfonyBundle\Service\CacheStrategy;
use PHPUnit\Framework\TestCase;

class CacheStrategyTest extends TestCase
{
    public function testShouldCacheRowLookup(): void
    {
        $strategy = new CacheStrategy([
            'enabled' => true,
            'cache_primary_key_lookups' => true,
        ]);

        $analysis = [
            'operation_type' => 'read',
            'cache_key' => [
                'type' => 'row-lookup',
                'tables' => [
                    ['table' => 'users'],
                ],
            ],
        ];

        $this->assertTrue($strategy->shouldCache($analysis));
    }

    public function testShouldNotCacheDisabledStrategy(): void
    {
        $strategy = new CacheStrategy([
            'enabled' => false,
        ]);

        $analysis = [
            'operation_type' => 'read',
            'cache_key' => [
                'type' => 'row-lookup',
                'tables' => [
                    ['table' => 'users'],
                ],
            ],
        ];

        $this->assertFalse($strategy->shouldCache($analysis));
    }

    public function testShouldNotCacheWriteQueries(): void
    {
        $strategy = new CacheStrategy([
            'enabled' => true,
        ]);

        $analysis = [
            'operation_type' => 'write',
            'cache_key' => [
                'type' => 'update',
                'tables' => [
                    ['table' => 'users'],
                ],
            ],
        ];

        $this->assertFalse($strategy->shouldCache($analysis));
    }

    public function testShouldNotCacheExcludedTables(): void
    {
        $strategy = new CacheStrategy([
            'enabled' => true,
            'exclude_tables' => ['sessions'],
        ]);

        $analysis = [
            'operation_type' => 'read',
            'cache_key' => [
                'type' => 'row-lookup',
                'tables' => [
                    ['table' => 'sessions'],
                ],
            ],
        ];

        $this->assertFalse($strategy->shouldCache($analysis));
    }

    public function testShouldNotCacheTooManyJoins(): void
    {
        $strategy = new CacheStrategy([
            'enabled' => true,
            'max_join_tables' => 2,
        ]);

        $analysis = [
            'operation_type' => 'read',
            'cache_key' => [
                'type' => 'join',
                'tables' => [
                    ['table' => 'users'],
                    ['table' => 'orders'],
                    ['table' => 'products'],
                    ['table' => 'categories'],
                ],
            ],
        ];

        $this->assertFalse($strategy->shouldCache($analysis));
    }

    public function testGetTtlDefault(): void
    {
        $strategy = new CacheStrategy([
            'default_ttl' => 3600,
        ]);

        $analysis = [
            'cache_key' => [
                'tables' => [
                    ['table' => 'users'],
                ],
            ],
        ];

        $this->assertEquals(3600, $strategy->getTtl($analysis));
    }

    public function testGetTtlPerTable(): void
    {
        $strategy = new CacheStrategy([
            'default_ttl' => 3600,
            'table_ttls' => [
                'users' => 1800,
            ],
        ]);

        $analysis = [
            'cache_key' => [
                'tables' => [
                    ['table' => 'users'],
                ],
            ],
        ];

        $this->assertEquals(1800, $strategy->getTtl($analysis));
    }

    public function testGetTtlLowestForMultipleTables(): void
    {
        $strategy = new CacheStrategy([
            'default_ttl' => 3600,
            'table_ttls' => [
                'users' => 1800,
                'orders' => 900,
            ],
        ]);

        $analysis = [
            'cache_key' => [
                'tables' => [
                    ['table' => 'users'],
                    ['table' => 'orders'],
                ],
            ],
        ];

        $this->assertEquals(900, $strategy->getTtl($analysis));
    }

    public function testGetPrimaryTable(): void
    {
        $strategy = new CacheStrategy();

        $analysis = [
            'cache_key' => [
                'tables' => [
                    ['table' => 'users'],
                    ['table' => 'orders'],
                ],
            ],
        ];

        $this->assertEquals('users', $strategy->getPrimaryTable($analysis));
    }
}
