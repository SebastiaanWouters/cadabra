<?php

declare(strict_types=1);

namespace Cadabra\Client;

use Psr\Http\Client\ClientInterface;
use Psr\Http\Message\RequestFactoryInterface;
use Psr\Http\Message\StreamFactoryInterface;
use Psr\Log\LoggerInterface;
use Psr\Log\NullLogger;

/**
 * HTTP client for Cadabra service.
 * Sends raw SQL to server - NO normalization logic here.
 * Server handles all normalization, analysis, and cache key generation.
 */
class CadabraClient
{
    private ClientInterface $httpClient;
    private RequestFactoryInterface $requestFactory;
    private StreamFactoryInterface $streamFactory;
    private string $baseUrl;
    private string $prefix;
    private int $timeout;
    private LoggerInterface $logger;

    public function __construct(
        ClientInterface $httpClient,
        RequestFactoryInterface $requestFactory,
        StreamFactoryInterface $streamFactory,
        string $baseUrl,
        string $prefix = 'cadabra',
        int $timeout = 5,
        ?LoggerInterface $logger = null
    ) {
        $this->httpClient = $httpClient;
        $this->requestFactory = $requestFactory;
        $this->streamFactory = $streamFactory;
        $this->baseUrl = rtrim($baseUrl, '/');
        $this->prefix = $prefix;
        $this->timeout = $timeout;
        $this->logger = $logger ?? new NullLogger();
    }

    /**
     * Analyze SQL query - server handles normalization and cache key generation.
     *
     * @param string $sql Raw SQL query (Doctrine-generated, with t0, t1 aliases)
     * @param array<mixed> $params Query parameters
     * @return array<string, mixed> Analysis result with cache_key, operation_type, etc.
     * @throws CadabraException
     */
    public function analyze(string $sql, array $params = []): array
    {
        return $this->post('/analyze', [
            'sql' => $sql,
            'params' => $params,
        ]);
    }

    /**
     * Register query result with Cadabra service.
     * Server generates cache key from raw SQL.
     *
     * @param string $sql Raw SQL query
     * @param array<mixed> $params Query parameters
     * @param array<int, array<string, mixed>> $result Query result rows
     * @param int $ttl Cache TTL in seconds
     * @throws CadabraException
     */
    public function register(string $sql, array $params, array $result, int $ttl): void
    {
        $this->post('/register', [
            'sql' => $sql,
            'params' => $params,
            'result' => base64_encode(serialize($result)),
            'ttl' => $ttl,
        ]);
    }

    /**
     * Get cached result by fingerprint.
     *
     * @param string $fingerprint Cache key fingerprint from analysis
     * @return array<int, array<string, mixed>>|null Cached rows or null if not found
     * @throws CadabraException
     */
    public function get(string $fingerprint): ?array
    {
        try {
            $response = $this->httpGet("/cache/{$fingerprint}");

            if (empty($response['result'])) {
                return null;
            }

            $decoded = base64_decode($response['result'], true);
            if ($decoded === false) {
                return null;
            }

            $result = unserialize($decoded);
            return is_array($result) ? $result : null;
        } catch (CadabraException $e) {
            // Cache miss
            return null;
        }
    }

    /**
     * Invalidate cache asynchronously.
     * Server determines which cache keys to invalidate.
     *
     * @param string $sql Write query SQL
     * @param array<mixed> $params Query parameters
     * @throws CadabraException
     */
    public function invalidate(string $sql, array $params = []): void
    {
        // Async - fire and forget
        try {
            $this->post('/invalidate', [
                'sql' => $sql,
                'params' => $params,
            ]);
        } catch (CadabraException $e) {
            $this->logger->warning('Async invalidation failed', [
                'exception' => $e->getMessage(),
                'sql' => $sql,
            ]);
        }
    }

    /**
     * Invalidate cache synchronously (waits for completion).
     *
     * @param string $sql Write query SQL
     * @param array<mixed> $params Query parameters
     * @throws CadabraException
     */
    public function invalidateSync(string $sql, array $params = []): void
    {
        $this->post('/invalidate', [
            'sql' => $sql,
            'params' => $params,
            'sync' => true,
        ]);
    }

    /**
     * Check if a write query should trigger invalidation.
     *
     * @param string $sql Write query SQL
     * @param array<mixed> $params Query parameters
     * @return bool True if should invalidate
     * @throws CadabraException
     */
    public function shouldInvalidate(string $sql, array $params = []): bool
    {
        $result = $this->post('/should-invalidate', [
            'sql' => $sql,
            'params' => $params,
        ]);

        return $result['should_invalidate'] ?? false;
    }

    /**
     * Get cache statistics.
     *
     * @return array<string, mixed> Cache stats
     * @throws CadabraException
     */
    public function getStats(): array
    {
        return $this->httpGet('/stats');
    }

    /**
     * Clear all cache entries for a specific table.
     *
     * @param string $tableName Table name to clear
     * @throws CadabraException
     */
    public function clearTable(string $tableName): void
    {
        $this->httpDelete("/table/{$tableName}");
    }

    /**
     * Make POST request to Cadabra service.
     *
     * @param string $path API path
     * @param array<string, mixed> $data Request data
     * @return array<string, mixed> Response data
     * @throws CadabraException
     */
    private function post(string $path, array $data): array
    {
        try {
            $request = $this->requestFactory->createRequest('POST', $this->baseUrl . $path)
                ->withHeader('Content-Type', 'application/json')
                ->withHeader('Accept', 'application/json')
                ->withBody($this->streamFactory->createStream(json_encode($data)));

            $response = $this->httpClient->sendRequest($request);

            if ($response->getStatusCode() >= 400) {
                throw new CadabraException(
                    "HTTP {$response->getStatusCode()}: {$response->getBody()}"
                );
            }

            $body = (string) $response->getBody();
            $decoded = json_decode($body, true);

            if (!is_array($decoded)) {
                throw new CadabraException('Invalid JSON response from Cadabra service');
            }

            return $decoded;
        } catch (\Throwable $e) {
            if ($e instanceof CadabraException) {
                throw $e;
            }

            throw new CadabraException(
                'Failed to communicate with Cadabra service: ' . $e->getMessage(),
                0,
                $e
            );
        }
    }

    /**
     * Make GET request to Cadabra service.
     *
     * @param string $path API path
     * @return array<string, mixed> Response data
     * @throws CadabraException
     */
    private function httpGet(string $path): array
    {
        try {
            $request = $this->requestFactory->createRequest('GET', $this->baseUrl . $path)
                ->withHeader('Accept', 'application/json');

            $response = $this->httpClient->sendRequest($request);

            if ($response->getStatusCode() >= 400) {
                throw new CadabraException(
                    "HTTP {$response->getStatusCode()}: {$response->getBody()}"
                );
            }

            $body = (string) $response->getBody();
            $decoded = json_decode($body, true);

            if (!is_array($decoded)) {
                throw new CadabraException('Invalid JSON response from Cadabra service');
            }

            return $decoded;
        } catch (\Throwable $e) {
            if ($e instanceof CadabraException) {
                throw $e;
            }

            throw new CadabraException(
                'Failed to communicate with Cadabra service: ' . $e->getMessage(),
                0,
                $e
            );
        }
    }

    /**
     * Make DELETE request to Cadabra service.
     *
     * @param string $path API path
     * @throws CadabraException
     */
    private function httpDelete(string $path): void
    {
        try {
            $request = $this->requestFactory->createRequest('DELETE', $this->baseUrl . $path);

            $response = $this->httpClient->sendRequest($request);

            if ($response->getStatusCode() >= 400) {
                throw new CadabraException(
                    "HTTP {$response->getStatusCode()}: {$response->getBody()}"
                );
            }
        } catch (\Throwable $e) {
            if ($e instanceof CadabraException) {
                throw $e;
            }

            throw new CadabraException(
                'Failed to communicate with Cadabra service: ' . $e->getMessage(),
                0,
                $e
            );
        }
    }
}
