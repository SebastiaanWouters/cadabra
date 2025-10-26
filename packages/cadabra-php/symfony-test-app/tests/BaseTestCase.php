<?php

namespace App\Tests;

use App\Tests\Fixtures\DataFixtures;
use Doctrine\ORM\EntityManagerInterface;
use Doctrine\ORM\Tools\SchemaTool;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;

abstract class BaseTestCase extends KernelTestCase
{
    protected EntityManagerInterface $entityManager;
    protected DataFixtures $fixtures;
    protected static bool $schemaCreated = false;

    protected function setUp(): void
    {
        parent::setUp();

        self::bootKernel();
        $this->entityManager = static::getContainer()->get(EntityManagerInterface::class);
        $this->fixtures = new DataFixtures($this->entityManager);

        // Check if schema actually exists instead of relying on static flag
        if (!$this->schemaExists()) {
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

        // Don't close EntityManager for in-memory SQLite databases
        // Closing the connection destroys the entire :memory: database
        $platform = $this->entityManager->getConnection()->getDatabasePlatform();
        $params = $this->entityManager->getConnection()->getParams();
        $isInMemory = isset($params['memory']) && $params['memory'] === true
            || (isset($params['path']) && $params['path'] === ':memory:')
            || (isset($params['url']) && str_contains($params['url'], ':memory:'));

        if (!$isInMemory) {
            $this->entityManager->close();
        }

        parent::tearDown();
    }

    protected function schemaExists(): bool
    {
        try {
            $connection = $this->entityManager->getConnection();
            $schemaManager = $connection->createSchemaManager();
            $tables = $schemaManager->listTableNames();

            // Check if at least one of our entity tables exists
            // Using 'users' as a marker table since it's fundamental
            return in_array('users', $tables, true);
        } catch (\Exception $e) {
            return false;
        }
    }

    protected function createDatabaseSchema(): void
    {
        $metadatas = $this->entityManager->getMetadataFactory()->getAllMetadata();
        $schemaTool = new SchemaTool($this->entityManager);

        // Only create schema, don't drop
        // Tests use transactions for isolation, so we don't need to drop/recreate
        $schemaTool->createSchema($metadatas);
    }

    protected function clearDatabase(): void
    {
        $connection = $this->entityManager->getConnection();

        $tables = [
            'order_items',
            'reviews',
            'orders',
            'products',
            'categories',
            'users',
        ];

        foreach ($tables as $table) {
            $connection->executeStatement("DELETE FROM {$table}");
        }
    }

    protected function refreshEntityManager(): void
    {
        $this->entityManager->clear();
    }

    /**
     * Load minimal test data for basic tests
     */
    protected function loadMinimalFixtures(): void
    {
        $this->fixtures->createMinimalData();
    }

    /**
     * Load comprehensive test data for integration tests
     */
    protected function loadIntegrationFixtures(): void
    {
        $this->fixtures->createIntegrationData();
    }

    /**
     * Load large dataset for benchmarking
     */
    protected function loadBenchmarkFixtures(): void
    {
        $this->fixtures->createBenchmarkData();
    }
}
