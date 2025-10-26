<?php

declare(strict_types=1);

namespace Cadabra\SymfonyBundle\Middleware;

use Cadabra\Client\CadabraClient;
use Cadabra\SymfonyBundle\Service\CacheStrategy;
use Doctrine\DBAL\Driver\Connection;
use Doctrine\DBAL\Driver\Result;
use Doctrine\DBAL\Driver\Statement;
use Psr\Log\LoggerInterface;
use Symfony\Contracts\Cache\CacheInterface;

/**
 * Connection wrapper that creates CadabraStatements.
 */
class CadabraConnection implements Connection
{
    private Connection $wrappedConnection;
    private CadabraClient $client;
    private CacheStrategy $strategy;
    private CacheInterface $cache;
    private string $prefix;
    private ?LoggerInterface $logger;

    public function __construct(
        Connection $wrappedConnection,
        CadabraClient $client,
        CacheStrategy $strategy,
        CacheInterface $cache,
        string $prefix,
        ?LoggerInterface $logger = null
    ) {
        $this->wrappedConnection = $wrappedConnection;
        $this->client = $client;
        $this->strategy = $strategy;
        $this->cache = $cache;
        $this->prefix = $prefix;
        $this->logger = $logger;
    }

    /**
     * {@inheritdoc}
     */
    public function prepare(string $sql): Statement
    {
        $wrappedStatement = $this->wrappedConnection->prepare($sql);

        // Wrap with CadabraStatement
        return new CadabraStatement(
            $wrappedStatement,
            $sql,
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
    public function query(string $sql): Result
    {
        return $this->wrappedConnection->query($sql);
    }

    /**
     * {@inheritdoc}
     */
    public function quote($value, $type = \Doctrine\DBAL\ParameterType::STRING)
    {
        return $this->wrappedConnection->quote($value, $type);
    }

    /**
     * {@inheritdoc}
     */
    public function exec(string $sql): int
    {
        return $this->wrappedConnection->exec($sql);
    }

    /**
     * {@inheritdoc}
     */
    public function lastInsertId($name = null)
    {
        return $this->wrappedConnection->lastInsertId($name);
    }

    /**
     * {@inheritdoc}
     */
    public function beginTransaction(): void
    {
        $this->wrappedConnection->beginTransaction();
    }

    /**
     * {@inheritdoc}
     */
    public function commit(): void
    {
        $this->wrappedConnection->commit();
    }

    /**
     * {@inheritdoc}
     */
    public function rollBack(): void
    {
        $this->wrappedConnection->rollBack();
    }

    /**
     * {@inheritdoc}
     */
    public function getServerVersion(): string
    {
        return $this->wrappedConnection->getServerVersion();
    }

    /**
     * {@inheritdoc}
     */
    public function getNativeConnection()
    {
        return $this->wrappedConnection->getNativeConnection();
    }
}
