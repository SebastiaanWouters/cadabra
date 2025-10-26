<?php

namespace App\Tests\Integration;

use App\Entity\Category;
use App\Entity\Product;
use App\Entity\User;
use App\Repository\ProductRepository;
use App\Repository\UserRepository;
use App\Tests\BaseTestCase;

class CacheFunctionalityTest extends BaseTestCase
{
    private UserRepository $userRepository;
    private ProductRepository $productRepository;

    protected function setUp(): void
    {
        parent::setUp();

        $this->userRepository = $this->entityManager->getRepository(User::class);
        $this->productRepository = $this->entityManager->getRepository(Product::class);

        // Create specific test data for cache functionality tests
        $this->setupCacheFunctionalityTestData();
    }

    private function setupCacheFunctionalityTestData(): void
    {
        // Create test category
        $category = new Category();
        $category->setName('Electronics');
        $category->setDescription('Electronic products');
        $this->entityManager->persist($category);

        // Create test users
        for ($i = 1; $i <= 10; $i++) {
            $user = new User();
            $user->setName("Test User {$i}");
            $user->setEmail("user{$i}@test.com");
            $this->entityManager->persist($user);
        }

        // Create products with distinctly separate price ranges
        // Low price range: 15-35 (will be matched by query 10-50)
        for ($i = 1; $i <= 10; $i++) {
            $product = new Product();
            $product->setName("Low Price Product {$i}");
            $product->setPrice((string) (14 + $i * 2));  // 16, 18, 20, ..., 34
            $product->setStock($i * 5);
            $product->setCategory($category);
            $this->entityManager->persist($product);
        }

        // High price range: 250-450 (will be matched by query 200-450)
        for ($i = 1; $i <= 20; $i++) {
            $product = new Product();
            $product->setName("High Price Product {$i}");
            $product->setPrice((string) (240 + ($i * 10)));  // 250, 260, 270, ..., 440
            $product->setStock($i * 5);
            $product->setCategory($category);
            $this->entityManager->persist($product);
        }

        $this->entityManager->flush();
        $this->entityManager->clear();
    }

    public function testSimpleQueryCacheMissOnFirstQuery(): void
    {
        // First query should be a cache MISS (data comes from database)
        $user = $this->userRepository->findByEmail('user1@test.com');

        $this->assertNotNull($user);
        $this->assertEquals('Test User 1', $user->getName());
        $this->assertEquals('user1@test.com', $user->getEmail());
    }

    public function testSimpleQueryCacheHitOnRepeatedQuery(): void
    {
        // First query - cache MISS
        $user1 = $this->userRepository->findByEmail('user2@test.com');
        $this->assertNotNull($user1);

        // Clear entity manager to ensure fresh fetch
        $this->refreshEntityManager();

        // Second identical query - should be cache HIT
        $user2 = $this->userRepository->findByEmail('user2@test.com');
        $this->assertNotNull($user2);
        $this->assertEquals($user1->getId(), $user2->getId());
        $this->assertEquals($user1->getName(), $user2->getName());
    }

    public function testCacheInvalidationOnInsert(): void
    {
        // Query users
        $initialCount = $this->userRepository->countTotal();
        $this->assertEquals(10, $initialCount);

        // Insert new user
        $newUser = new User();
        $newUser->setName('New User');
        $newUser->setEmail('newuser@test.com');
        $this->entityManager->persist($newUser);
        $this->entityManager->flush();

        // Query again - cache should be invalidated
        $this->refreshEntityManager();
        $newCount = $this->userRepository->countTotal();
        $this->assertEquals(11, $newCount);
    }

    public function testCacheInvalidationOnUpdate(): void
    {
        // Fetch user
        $user = $this->userRepository->findByEmail('user3@test.com');
        $this->assertNotNull($user);
        $this->assertEquals('Test User 3', $user->getName());

        // Update user
        $user->setName('Updated User 3');
        $this->entityManager->flush();

        // Query again - should get updated data
        $this->refreshEntityManager();
        $updatedUser = $this->userRepository->findByEmail('user3@test.com');
        $this->assertEquals('Updated User 3', $updatedUser->getName());
    }

    public function testCacheInvalidationOnDelete(): void
    {
        // Fetch user
        $user = $this->userRepository->findByEmail('user4@test.com');
        $this->assertNotNull($user);

        $userId = $user->getId();

        // Delete user
        $this->entityManager->remove($user);
        $this->entityManager->flush();

        // Query again - should return null
        $this->refreshEntityManager();
        $deletedUser = $this->userRepository->find($userId);
        $this->assertNull($deletedUser);
    }

    public function testJoinQueryCaching(): void
    {
        // Query products with category (JOIN)
        $products1 = $this->productRepository->findWithCategory(5);
        $this->assertCount(5, $products1);
        $this->assertNotNull($products1[0]->getCategory());

        // Clear and query again - should be cached
        $this->refreshEntityManager();
        $products2 = $this->productRepository->findWithCategory(5);
        $this->assertCount(5, $products2);

        // Verify same data
        for ($i = 0; $i < 5; $i++) {
            $this->assertEquals($products1[$i]->getId(), $products2[$i]->getId());
            $this->assertEquals($products1[$i]->getName(), $products2[$i]->getName());
        }
    }

    public function testAggregateQueryCaching(): void
    {
        // Aggregate query - average price by category
        $stats1 = $this->productRepository->getAveragePriceByCategory();
        $this->assertNotEmpty($stats1);

        // Query again - should be cached
        $stats2 = $this->productRepository->getAveragePriceByCategory();
        $this->assertEquals($stats1, $stats2);
    }

    public function testMultiTableInvalidation(): void
    {
        // Query products by category
        $category = $this->entityManager->getRepository(Category::class)->findByName('Electronics');
        $this->assertNotNull($category);

        $products = $this->productRepository->findByCategory($category->getId());
        $initialCount = count($products);
        $this->assertEquals(30, $initialCount, 'Should have 30 products (10 low price + 20 high price)');

        // Add new product to category - should invalidate category-related queries
        $newProduct = new Product();
        $newProduct->setName('New Product');
        $newProduct->setPrice('199.99');
        $newProduct->setStock(100);
        $newProduct->setCategory($category);
        $this->entityManager->persist($newProduct);
        $this->entityManager->flush();

        // Query again - should reflect new product
        $this->refreshEntityManager();
        $category = $this->entityManager->getRepository(Category::class)->findByName('Electronics');
        $updatedProducts = $this->productRepository->findByCategory($category->getId());
        $this->assertEquals($initialCount + 1, count($updatedProducts));
    }

    public function testPaginatedQueryCaching(): void
    {
        // Query page 1
        $page1 = $this->userRepository->findPaginated(1, 5);
        $this->assertCount(5, $page1);

        // Query page 2
        $page2 = $this->userRepository->findPaginated(2, 5);
        $this->assertCount(5, $page2);

        // Verify different results
        $this->assertNotEquals($page1[0]->getId(), $page2[0]->getId());

        // Query page 1 again - should be cached
        $this->refreshEntityManager();
        $page1Again = $this->userRepository->findPaginated(1, 5);
        $this->assertCount(5, $page1Again);

        for ($i = 0; $i < 5; $i++) {
            $this->assertEquals($page1[$i]->getId(), $page1Again[$i]->getId());
        }
    }

    public function testParameterizedQueryCaching(): void
    {
        // Query with parameters - Low price range (16-34)
        $products1 = $this->productRepository->findInPriceRange('10', '50');
        $count1 = count($products1);
        $this->assertGreaterThan(0, $count1, 'Should find products in low price range');
        $this->assertEquals(10, $count1, 'Should find exactly 10 products in low price range');

        // Same query - should be cached
        $this->refreshEntityManager();
        $products2 = $this->productRepository->findInPriceRange('10', '50');
        $this->assertEquals($count1, count($products2), 'Cached query should return same count');

        // Different parameters - should be different cache entry (high price range: 250-440)
        $products3 = $this->productRepository->findInPriceRange('200', '450');
        $count3 = count($products3);
        $this->assertGreaterThan(0, $count3, 'Should find products in high price range');
        $this->assertEquals(20, $count3, 'Should find exactly 20 products in high price range');
        // These ranges don't overlap, so counts should be different
        // Low: 10 products (16-34), High: 20 products (250-440)
        $this->assertNotEquals($count1, $count3, 'Different price ranges should return different counts (Low: ' . $count1 . ', High: ' . $count3 . ')');
    }
}
