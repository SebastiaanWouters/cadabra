<?php

declare(strict_types=1);

namespace Cadabra\SymfonyBundle\Service;

/**
 * Determines whether and how to cache queries based on heuristics.
 * Uses server analysis results (NOT raw SQL parsing).
 */
class CacheStrategy
{
    private bool $enabled;
    private int $defaultTtl;
    private bool $cachePrimaryKeyLookups;
    private bool $cacheSimpleWhere;
    private int $maxJoinTables;
    /** @var array<string> */
    private array $excludeKeywords;
    /** @var array<string> */
    private array $excludeTables;
    /** @var array<string, int> */
    private array $tableTtls;

    /**
     * @param array<string, mixed> $config Configuration array
     */
    public function __construct(array $config = [])
    {
        $this->enabled = $config['enabled'] ?? true;
        $this->defaultTtl = $config['default_ttl'] ?? 3600;
        $this->cachePrimaryKeyLookups = $config['cache_primary_key_lookups'] ?? true;
        $this->cacheSimpleWhere = $config['cache_simple_where'] ?? true;
        $this->maxJoinTables = $config['max_join_tables'] ?? 2;
        $this->excludeKeywords = $config['exclude_keywords'] ?? ['FOR UPDATE', 'LOCK IN SHARE MODE'];
        $this->excludeTables = $config['exclude_tables'] ?? ['sessions', 'messenger_messages'];
        $this->tableTtls = $config['table_ttls'] ?? [];
    }

    /**
     * Determine if a query should be cached based on server analysis.
     *
     * @param array<mixed> $analysis Analysis result from Cadabra server
     * @return bool True if should cache
     */
    public function shouldCache(array $analysis): bool
    {
        if (!$this->enabled) {
            return false;
        }

        // Only cache SELECT queries
        if (($analysis['operation_type'] ?? '') !== 'read') {
            return false;
        }

        $cacheKey = $analysis['cache_key'] ?? [];
        $tables = $cacheKey['tables'] ?? [];

        // Check for excluded tables
        foreach ($tables as $tableInfo) {
            $tableName = $tableInfo['table'] ?? '';
            if (in_array($tableName, $this->excludeTables, true)) {
                return false;
            }
        }

        // Check join complexity
        if (count($tables) > $this->maxJoinTables + 1) {
            return false;
        }

        // Apply specific heuristics based on server's query type
        $queryType = $cacheKey['type'] ?? '';

        if ($queryType === 'row-lookup' && $this->cachePrimaryKeyLookups) {
            return true;
        }

        if ($queryType === 'simple-where' && $this->cacheSimpleWhere) {
            return true;
        }

        // Cache other simple queries by default
        return in_array($queryType, ['simple-where', 'row-lookup', 'table-scan'], true);
    }

    /**
     * Get TTL for a query based on its tables.
     *
     * @param array<mixed> $analysis Analysis result from Cadabra server
     * @return int TTL in seconds
     */
    public function getTtl(array $analysis): int
    {
        $cacheKey = $analysis['cache_key'] ?? [];
        $tables = $cacheKey['tables'] ?? [];

        if (empty($tables)) {
            return $this->defaultTtl;
        }

        // Use the lowest TTL among all tables in the query
        $ttl = $this->defaultTtl;

        foreach ($tables as $tableInfo) {
            $tableName = $tableInfo['table'] ?? '';
            if (isset($this->tableTtls[$tableName])) {
                $ttl = min($ttl, $this->tableTtls[$tableName]);
            }
        }

        return $ttl;
    }

    /**
     * Get the primary table from the query.
     *
     * @param array<mixed> $analysis
     * @return string|null
     */
    public function getPrimaryTable(array $analysis): ?string
    {
        $cacheKey = $analysis['cache_key'] ?? [];
        $tables = $cacheKey['tables'] ?? [];

        if (empty($tables)) {
            return null;
        }

        // First table is the primary table (FROM clause)
        return $tables[0]['table'] ?? null;
    }
}
