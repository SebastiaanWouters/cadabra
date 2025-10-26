<?php

namespace App\Tests\Integration;

use App\Entity\Category;
use App\Entity\Product;
use App\Entity\User;
use App\Repository\ProductRepository;
use App\Repository\UserRepository;
use App\Tests\BaseTestCase;

class EdgeCasesAndErrorHandlingTest extends BaseTestCase
{
    private UserRepository $userRepository;
    private ProductRepository $productRepository;

    protected function setUp(): void
    {
        parent::setUp();

        $this->userRepository = $this->entityManager->getRepository(User::class);
        $this->productRepository = $this->entityManager->getRepository(Product::class);

        // Load fixtures for tests that need data
        $this->loadIntegrationFixtures();
    }

    public function testEmptyResultSet(): void
    {
        // Query that returns no results
        $user = $this->userRepository->findByEmail('nonexistent@example.com');
        $this->assertNull($user);

        $users = $this->userRepository->findRecentUsers(new \DateTimeImmutable('+1 year'));
        $this->assertEmpty($users);
    }

    public function testLargeResultSet(): void
    {
        // Create many users with unique emails to avoid conflicts with fixtures
        for ($i = 1000; $i < 2000; $i++) {
            $user = new User();
            $user->setName("Large Test User {$i}");
            $user->setEmail("largetest{$i}@test.com");
            $this->entityManager->persist($user);

            if ($i % 100 === 0) {
                $this->entityManager->flush();
            }
        }
        $this->entityManager->flush();

        // Query large result set
        $allUsers = $this->userRepository->findAll();
        $this->assertGreaterThanOrEqual(1000, count($allUsers));

        // Test pagination with large dataset
        $page1 = $this->userRepository->findPaginated(1, 50);
        $this->assertCount(50, $page1);

        $page2 = $this->userRepository->findPaginated(2, 50);
        $this->assertCount(50, $page2);

        // Verify different pages
        $this->assertNotEquals($page1[0]->getId(), $page2[0]->getId());
    }

    public function testNullAndEmptyValues(): void
    {
        $category = new Category();
        $category->setName('Test Category');
        $category->setDescription(null); // Nullable field
        $this->entityManager->persist($category);

        $product = new Product();
        $product->setName('Product with null description');
        $product->setPrice('99.99');
        $product->setStock(10);
        $product->setDescription(null); // Nullable field
        $product->setCategory($category);
        $this->entityManager->persist($product);

        $this->entityManager->flush();

        $this->refreshEntityManager();
        $savedProduct = $this->productRepository->findOneBy(['name' => 'Product with null description']);
        $this->assertNotNull($savedProduct);
        $this->assertNull($savedProduct->getDescription());
    }

    public function testSpecialCharactersInData(): void
    {
        $specialNames = [
            "O'Reilly",
            'Test "Quoted" Name',
            "Name with\nNewline",
            "Name with\tTab",
            "Unicode: 你好世界",
            "Emoji: 🚀💻",
            "SQL: ' OR '1'='1",
        ];

        foreach ($specialNames as $name) {
            $user = new User();
            $user->setName($name);
            $user->setEmail(md5($name) . '@test.com');
            $this->entityManager->persist($user);
        }

        $this->entityManager->flush();
        $this->refreshEntityManager();

        // Verify all special characters are preserved
        foreach ($specialNames as $name) {
            $user = $this->userRepository->findOneBy(['name' => $name]);
            $this->assertNotNull($user, "Failed to find user with name: {$name}");
            $this->assertEquals($name, $user->getName());
        }
    }

    public function testConcurrentModifications(): void
    {
        $user = new User();
        $user->setName('Concurrent User');
        $user->setEmail('concurrent@test.com');
        $this->entityManager->persist($user);
        $this->entityManager->flush();

        $userId = $user->getId();

        // Simulate concurrent reads
        $this->refreshEntityManager();
        $user1 = $this->userRepository->find($userId);
        $user2 = $this->userRepository->find($userId);

        $this->assertEquals($user1->getName(), $user2->getName());
        $this->assertEquals($user1->getEmail(), $user2->getEmail());
    }

    public function testBoundaryValues(): void
    {
        $category = new Category();
        $category->setName('Boundary Test');
        $this->entityManager->persist($category);

        // Test with very small price
        $product1 = new Product();
        $product1->setName('Cheap Product');
        $product1->setPrice('0.01');
        $product1->setStock(0);
        $product1->setCategory($category);
        $this->entityManager->persist($product1);

        // Test with very large price
        $product2 = new Product();
        $product2->setName('Expensive Product');
        $product2->setPrice('99999999.99');
        $product2->setStock(999999);
        $product2->setCategory($category);
        $this->entityManager->persist($product2);

        $this->entityManager->flush();
        $this->refreshEntityManager();

        $savedProduct1 = $this->productRepository->findOneBy(['name' => 'Cheap Product']);
        $this->assertEquals('0.01', $savedProduct1->getPrice());
        $this->assertEquals(0, $savedProduct1->getStock());

        $savedProduct2 = $this->productRepository->findOneBy(['name' => 'Expensive Product']);
        $this->assertEquals('99999999.99', $savedProduct2->getPrice());
        $this->assertEquals(999999, $savedProduct2->getStock());
    }

    public function testComplexQueryWithNoResults(): void
    {
        // Complex multi-table query that returns aggregate results
        $result = $this->productRepository->getAveragePriceByCategory();

        // Should always return an array
        $this->assertIsArray($result);

        // With products in the database (from fixtures), we should have results
        $this->assertNotEmpty($result, 'Should have category average prices from fixture data');

        // Each result should have category_name, avg_price, and product_count
        foreach ($result as $item) {
            $this->assertArrayHasKey('category_name', $item, 'Result should have category_name key');
            $this->assertArrayHasKey('avg_price', $item, 'Result should have avg_price key');
            $this->assertArrayHasKey('product_count', $item, 'Result should have product_count key');
            $this->assertIsNumeric($item['avg_price']);
            $this->assertGreaterThan(0, $item['product_count']);
        }
    }

    public function testQueryWithManyParameters(): void
    {
        $category = new Category();
        $category->setName('Multi-Param Category');
        $this->entityManager->persist($category);

        for ($i = 0; $i < 50; $i++) {
            $product = new Product();
            $product->setName("Multi-Param Product {$i}");
            $product->setPrice((string) (10 + $i));
            $product->setStock(100 - $i);
            $product->setCategory($category);
            $this->entityManager->persist($product);
        }

        $this->entityManager->flush();
        $this->refreshEntityManager();

        // Query with multiple parameter-based filters
        $products = $this->productRepository->findInPriceRange('15', '35');
        $this->assertGreaterThan(0, count($products));

        foreach ($products as $product) {
            $price = (float) $product->getPrice();
            $this->assertGreaterThanOrEqual(15.0, $price);
            $this->assertLessThanOrEqual(35.0, $price);
        }
    }

    public function testRepeatedIdenticalQueries(): void
    {
        $user = new User();
        $user->setName('Repeated Query User');
        $user->setEmail('repeated@test.com');
        $this->entityManager->persist($user);
        $this->entityManager->flush();

        // Execute same query multiple times
        $results = [];
        for ($i = 0; $i < 10; $i++) {
            $this->refreshEntityManager();
            $results[] = $this->userRepository->findByEmail('repeated@test.com');
        }

        // All results should be consistent
        $this->assertCount(10, $results);
        foreach ($results as $result) {
            $this->assertNotNull($result);
            $this->assertEquals('Repeated Query User', $result->getName());
        }
    }

    public function testDateTimeHandling(): void
    {
        // Test with specific dates
        $pastDate = new \DateTimeImmutable('2020-01-01');
        $futureDate = new \DateTimeImmutable('2030-12-31');
        $now = new \DateTimeImmutable();

        $user1 = new User();
        $user1->setName('Past User');
        $user1->setEmail('past@test.com');
        $user1->setCreatedAt($pastDate);
        $this->entityManager->persist($user1);

        $user2 = new User();
        $user2->setName('Future User');
        $user2->setEmail('future@test.com');
        $user2->setCreatedAt($futureDate);
        $this->entityManager->persist($user2);

        $this->entityManager->flush();
        $this->refreshEntityManager();

        // Query based on date ranges
        $recentUsers = $this->userRepository->findRecentUsers($pastDate);
        $this->assertGreaterThan(0, count($recentUsers));
    }

    public function testTransactionRollback(): void
    {
        // Create user
        $user = new User();
        $user->setName('Rollback User');
        $user->setEmail('rollback@test.com');
        $this->entityManager->persist($user);
        $this->entityManager->flush();

        $userId = $user->getId();
        $this->assertNotNull($userId);

        // Modify user
        $user->setName('Modified Name');

        // Don't flush - data should not persist after test teardown
        // The BaseTestCase rolls back transactions in tearDown()

        $this->refreshEntityManager();
        $fetchedUser = $this->userRepository->find($userId);

        // Within same transaction, we should see the original data
        // because we cleared the entity manager
        $this->assertEquals('Rollback User', $fetchedUser->getName());
    }

    public function testVeryLongStrings(): void
    {
        $longName = str_repeat('A', 255); // Max length for varchar(255)
        $longDescription = str_repeat('This is a very long description. ', 100);

        $user = new User();
        $user->setName($longName);
        $user->setEmail('longstring@test.com');
        $this->entityManager->persist($user);

        $category = new Category();
        $category->setName('Long String Category');
        $category->setDescription($longDescription);
        $this->entityManager->persist($category);

        $this->entityManager->flush();
        $this->refreshEntityManager();

        $savedUser = $this->userRepository->findByEmail('longstring@test.com');
        $this->assertEquals($longName, $savedUser->getName());

        $savedCategory = $this->entityManager->getRepository(Category::class)
            ->findOneBy(['name' => 'Long String Category']);
        $this->assertEquals($longDescription, $savedCategory->getDescription());
    }
}
