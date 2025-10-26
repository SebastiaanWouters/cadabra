<?php

declare(strict_types=1);

namespace Cadabra\SymfonyBundle\Middleware;

use Cadabra\Client\CadabraClient;
use Cadabra\SymfonyBundle\Service\CacheStrategy;
use Doctrine\DBAL\Driver;
use Doctrine\DBAL\Driver\Middleware;
use Psr\Log\LoggerInterface;
use Symfony\Contracts\Cache\CacheInterface;

/**
 * DBAL Middleware that intercepts database operations.
 * This is registered with Doctrine and wraps the driver.
 */
class CadabraMiddleware implements Middleware
{
    private CadabraClient $client;
    private CacheStrategy $strategy;
    private CacheInterface $cache;
    private string $prefix;
    private ?LoggerInterface $logger;

    public function __construct(
        CadabraClient $client,
        CacheStrategy $strategy,
        CacheInterface $cache,
        string $prefix,
        ?LoggerInterface $logger = null
    ) {
        $this->client = $client;
        $this->strategy = $strategy;
        $this->cache = $cache;
        $this->prefix = $prefix;
        $this->logger = $logger;
    }

    /**
     * {@inheritdoc}
     */
    public function wrap(Driver $driver): Driver
    {
        return new CadabraDriver(
            $driver,
            $this->client,
            $this->strategy,
            $this->cache,
            $this->prefix,
            $this->logger
        );
    }
}
