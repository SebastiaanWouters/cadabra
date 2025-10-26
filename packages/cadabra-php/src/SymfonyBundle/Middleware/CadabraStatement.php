<?php

declare(strict_types=1);

namespace Cadabra\SymfonyBundle\Middleware;

use Cadabra\Client\CadabraClient;
use Cadabra\SymfonyBundle\Service\CacheStrategy;
use Doctrine\DBAL\Driver\Result;
use Doctrine\DBAL\Driver\Statement;
use Doctrine\DBAL\ParameterType;
use Psr\Log\LoggerInterface;
use Psr\Log\NullLogger;
use Symfony\Contracts\Cache\CacheInterface;
use Symfony\Contracts\Cache\ItemInterface;

/**
 * Statement wrapper that intercepts at DBAL level.
 * This is the KEY component - intercepts after SQL generation, before database execution.
 *
 * IMPORTANT: Sends RAW SQL to Cadabra server without normalization.
 * Server handles all normalization, cache key generation, and analysis.
 */
class CadabraStatement implements Statement
{
    private Statement $wrappedStatement;
    private string $sql;
    private CadabraClient $client;
    private CacheStrategy $strategy;
    private CacheInterface $cache;
    private LoggerInterface $logger;
    private string $prefix;

    public function __construct(
        Statement $wrappedStatement,
        string $sql,
        CadabraClient $client,
        CacheStrategy $strategy,
        CacheInterface $cache,
        string $prefix,
        ?LoggerInterface $logger = null
    ) {
        $this->wrappedStatement = $wrappedStatement;
        $this->sql = $sql;
        $this->client = $client;
        $this->strategy = $strategy;
        $this->cache = $cache;
        $this->prefix = $prefix;
        $this->logger = $logger ?? new NullLogger();
    }

    /**
     * Execute the statement - THIS IS WHERE THE MAGIC HAPPENS.
     *
     * At this point:
     * - $this->sql is raw SQL from Doctrine: "SELECT t0.id FROM users t0 WHERE t0.id = ?"
     * - $params is: [10]
     * - We send RAW SQL to server (no normalization here)
     * - Server normalizes it and returns analysis
     *
     * {@inheritdoc}
     */
    public function execute($params = null): Result
    {
        // IMPORTANT: Keep $params as null if not provided - don't convert to []
        // If params were bound using bindValue/bindParam, execute(null) uses those
        // If we convert null to [], it overrides the bound params!

        try {
            // Send RAW SQL to server - server does all normalization
            $analysis = $this->client->analyze($this->sql, $params ?? []);

            // Route based on operation type from server
            return match ($analysis['operation_type'] ?? 'unknown') {
                'read' => $this->handleRead($params, $analysis),
                'write' => $this->handleWrite($params),
                default => $this->wrappedStatement->execute($params),
            };
        } catch (\Throwable $e) {
            // If anything fails with cache, fall back to normal execution
            $this->logger->warning('Cadabra execution failed, falling back to normal query', [
                'exception' => $e->getMessage(),
                'sql' => $this->sql,
            ]);

            return $this->wrappedStatement->execute($params);
        }
    }

    /**
     * Handle SELECT query - check cache or execute and cache.
     *
     * @param array<mixed>|null $params
     * @param array<mixed> $analysis Analysis from server
     */
    private function handleRead($params, array $analysis): Result
    {
        // Apply client-side heuristics: should we cache this query?
        if (!$this->strategy->shouldCache($analysis)) {
            $this->logger->debug('Query not cached (strategy)', ['sql' => $this->sql]);
            return $this->wrappedStatement->execute($params);
        }

        // Get fingerprint from server analysis
        $fingerprint = $analysis['cache_key']['fingerprint'] ?? null;
        if (!$fingerprint) {
            $this->logger->debug('No fingerprint from server', ['sql' => $this->sql]);
            return $this->wrappedStatement->execute($params);
        }

        // Build cache key with prefix
        $cacheKey = $this->prefix . '_' . $fingerprint;

        try {
            // Try to get from Symfony cache
            $cachedRows = $this->cache->get(
                $cacheKey,
                function (ItemInterface $item) use ($params, $analysis) {
                    // Cache miss - execute real query
                    $this->logger->debug('Cache MISS', ['sql' => $this->sql]);

                    $realResult = $this->wrappedStatement->execute($params);

                    // Fetch ALL rows to cache them
                    $rows = $realResult->fetchAllAssociative();

                    // Get TTL from strategy
                    $ttl = $this->strategy->getTtl($analysis);
                    $item->expiresAfter($ttl);

                    // Register with Cadabra server for invalidation tracking
                    try {
                        $this->client->register($this->sql, $params, $rows, $ttl);
                    } catch (\Throwable $e) {
                        // Log but don't fail if registration fails
                        $this->logger->warning('Failed to register cache with Cadabra', [
                            'exception' => $e->getMessage(),
                        ]);
                    }

                    return $rows;
                }
            );

            $this->logger->debug('Cache HIT', ['sql' => $this->sql, 'rows' => count($cachedRows)]);

            // Return CachedResult - Doctrine doesn't know the difference
            return new CachedResult($cachedRows);
        } catch (\Throwable $e) {
            $this->logger->error('Cache operation failed', [
                'exception' => $e->getMessage(),
                'sql' => $this->sql,
            ]);

            // Fallback to normal execution
            return $this->wrappedStatement->execute($params);
        }
    }

    /**
     * Handle write query (INSERT/UPDATE/DELETE) - execute and invalidate cache.
     *
     * @param array<mixed>|null $params
     */
    private function handleWrite($params): Result
    {
        // Execute the write query first
        $result = $this->wrappedStatement->execute($params);

        // Trigger async invalidation (don't wait for it)
        // Server determines which cache keys to invalidate
        try {
            $this->client->invalidate($this->sql, $params ?? []);
            $this->logger->debug('Invalidation queued', ['sql' => $this->sql]);
        } catch (\Throwable $e) {
            // Log but don't fail the write operation
            $this->logger->error('Failed to queue invalidation', [
                'exception' => $e->getMessage(),
                'sql' => $this->sql,
            ]);
        }

        return $result;
    }

    /**
     * {@inheritdoc}
     */
    public function bindValue($param, $value, $type = ParameterType::STRING)
    {
        return $this->wrappedStatement->bindValue($param, $value, $type);
    }

    /**
     * {@inheritdoc}
     */
    public function bindParam($param, &$variable, $type = ParameterType::STRING, $length = null)
    {
        return $this->wrappedStatement->bindParam($param, $variable, $type, $length);
    }
}
