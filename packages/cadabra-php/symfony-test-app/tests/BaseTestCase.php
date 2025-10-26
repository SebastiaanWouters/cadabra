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

        if (!self::$schemaCreated) {
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

        $this->entityManager->close();

        parent::tearDown();
    }

    protected function createDatabaseSchema(): void
    {
        $metadatas = $this->entityManager->getMetadataFactory()->getAllMetadata();
        $schemaTool = new SchemaTool($this->entityManager);

        // Use dropSchema() instead of dropDatabase() for SQLite compatibility
        // dropDatabase() deletes the entire file, dropSchema() just drops tables
        $schemaTool->dropSchema($metadatas);
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
