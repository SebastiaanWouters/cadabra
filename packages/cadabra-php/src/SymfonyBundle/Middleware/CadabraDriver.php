<?php

declare(strict_types=1);

namespace Cadabra\SymfonyBundle\Middleware;

use Cadabra\Client\CadabraClient;
use Cadabra\SymfonyBundle\Service\CacheStrategy;
use Doctrine\DBAL\Driver;
use Doctrine\DBAL\Driver\API\ExceptionConverter;
use Doctrine\DBAL\Driver\Connection;
use Doctrine\DBAL\Platforms\AbstractPlatform;
use Doctrine\DBAL\Schema\AbstractSchemaManager;
use Psr\Log\LoggerInterface;
use Symfony\Contracts\Cache\CacheInterface;

/**
 * Driver middleware that wraps the DBAL driver.
 */
class CadabraDriver implements Driver
{
    private Driver $wrappedDriver;
    private CadabraClient $client;
    private CacheStrategy $strategy;
    private CacheInterface $cache;
    private string $prefix;
    private ?LoggerInterface $logger;

    public function __construct(
        Driver $wrappedDriver,
        CadabraClient $client,
        CacheStrategy $strategy,
        CacheInterface $cache,
        string $prefix,
        ?LoggerInterface $logger = null
    ) {
        $this->wrappedDriver = $wrappedDriver;
        $this->client = $client;
        $this->strategy = $strategy;
        $this->cache = $cache;
        $this->prefix = $prefix;
        $this->logger = $logger;
    }

    /**
     * {@inheritdoc}
     */
    public function connect(array $params): Connection
    {
        $wrappedConnection = $this->wrappedDriver->connect($params);

        // Wrap with CadabraConnection
        return new CadabraConnection(
            $wrappedConnection,
            $this->client,
            $this->strategy,
            $this->cache,
            $this->prefix,
            $this->logger
        );
    }

    /**
     * {@inheritdoc}
     */
    public function getDatabasePlatform(): AbstractPlatform
    {
        return $this->wrappedDriver->getDatabasePlatform();
    }

    /**
     * {@inheritdoc}
     */
    public function getSchemaManager(\Doctrine\DBAL\Connection $conn, AbstractPlatform $platform): AbstractSchemaManager
    {
        return $this->wrappedDriver->getSchemaManager($conn, $platform);
    }

    /**
     * {@inheritdoc}
     */
    public function getExceptionConverter(): ExceptionConverter
    {
        return $this->wrappedDriver->getExceptionConverter();
    }
}
