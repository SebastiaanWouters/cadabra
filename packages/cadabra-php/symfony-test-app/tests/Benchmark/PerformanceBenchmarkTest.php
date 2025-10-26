<?php

namespace App\Tests\Benchmark;

use App\Entity\Order;
use App\Entity\Product;
use App\Entity\User;
use App\Repository\OrderRepository;
use App\Repository\ProductRepository;
use App\Repository\UserRepository;
use App\Tests\BaseTestCase;
use App\Tests\Helpers\BenchmarkHelper;

class PerformanceBenchmarkTest extends BaseTestCase
{
    private UserRepository $userRepository;
    private ProductRepository $productRepository;
    private OrderRepository $orderRepository;

    protected function setUp(): void
    {
        parent::setUp();

        $this->userRepository = $this->entityManager->getRepository(User::class);
        $this->productRepository = $this->entityManager->getRepository(Product::class);
        $this->orderRepository = $this->entityManager->getRepository(Order::class);
    }

    public function testSimpleRowLookupPerformance(): void
    {
        BenchmarkHelper::benchmark(
            'Simple Row Lookup (findByEmail)',
            fn() => $this->loadBenchmarkFixtures(),
            fn() => $this->userRepository->findByEmail('user5@test.com')
        );

        $this->assertTrue(true); // PHPUnit requires at least one assertion
    }

    public function testJoinQueryPerformance(): void
    {
        BenchmarkHelper::benchmark(
            'Paginated Users (2-table JOIN with pagination)',
            fn() => $this->loadBenchmarkFixtures(),
            function () {
                $users = $this->userRepository->findPaginated(1, 20);
                // Ensure query executes
                count($users);
            }
        );

        $this->assertTrue(true);
    }

    public function testComplexMultiTableJoinPerformance(): void
    {
        BenchmarkHelper::benchmark(
            'Product Price Range Query (multi-table with category)',
            fn() => $this->loadBenchmarkFixtures(),
            function () {
                $products = $this->productRepository->findInPriceRange('100', '500');
                count($products);
            }
        );

        $this->assertTrue(true);
    }

    public function testAggregateQueryPerformance(): void
    {
        BenchmarkHelper::benchmark(
            'Average Price by Category (GROUP BY + aggregate)',
            fn() => $this->loadBenchmarkFixtures(),
            fn() => $this->productRepository->getAveragePriceByCategory()
        );

        $this->assertTrue(true);
    }

    public function testPaginationPerformance(): void
    {
        BenchmarkHelper::benchmark(
            'Paginated Results (LIMIT + OFFSET)',
            fn() => $this->loadBenchmarkFixtures(),
            function () {
                // Test multiple pages
                for ($page = 1; $page <= 5; $page++) {
                    $this->userRepository->findPaginated($page, 10);
                }
            }
        );

        $this->assertTrue(true);
    }

    public function testSearchQueryPerformance(): void
    {
        BenchmarkHelper::benchmark(
            'Product Search (LIKE + multiple filters)',
            fn() => $this->loadBenchmarkFixtures(),
            fn() => $this->productRepository->findInPriceRange('100', '300')
        );

        $this->assertTrue(true);
    }

    public function testConcurrentQueriesPerformance(): void
    {
        BenchmarkHelper::benchmark(
            'Concurrent Similar Queries (cache reuse)',
            fn() => $this->loadBenchmarkFixtures(),
            function () {
                // Run multiple queries that can benefit from caching
                for ($i = 1; $i <= 5; $i++) {
                    $this->userRepository->findByEmail("user{$i}@test.com");
                }
            }
        );

        $this->assertTrue(true);
    }

    public function testParameterizedQueryPerformance(): void
    {
        BenchmarkHelper::benchmark(
            'Parameterized Queries (different parameters)',
            fn() => $this->loadBenchmarkFixtures(),
            function () {
                $this->productRepository->findInPriceRange('10', '50');
                $this->productRepository->findInPriceRange('51', '100');
                $this->productRepository->findInPriceRange('101', '200');
            }
        );

        $this->assertTrue(true);
    }

    public function testComplexAggregatePerformance(): void
    {
        BenchmarkHelper::benchmark(
            'Complex Aggregate Queries (GROUP BY)',
            fn() => $this->loadBenchmarkFixtures(),
            function () {
                $this->productRepository->getAveragePriceByCategory();
            }
        );

        $this->assertTrue(true);
    }

    public function testConcurrentReadsPerformance(): void
    {
        BenchmarkHelper::benchmark(
            'High Volume Concurrent Reads',
            fn() => $this->loadBenchmarkFixtures(),
            function () {
                // Simulate multiple concurrent reads
                for ($i = 0; $i < 30; $i++) {
                    $userId = ($i % 100) + 1;
                    $this->userRepository->find($userId);
                }
            }
        );

        $this->assertTrue(true);
    }

    /**
     * This test runs last and prints the summary
     * @depends testSimpleRowLookupPerformance
     * @depends testJoinQueryPerformance
     * @depends testComplexMultiTableJoinPerformance
     * @depends testAggregateQueryPerformance
     * @depends testPaginationPerformance
     * @depends testSearchQueryPerformance
     * @depends testConcurrentQueriesPerformance
     * @depends testParameterizedQueryPerformance
     * @depends testComplexAggregatePerformance
     * @depends testConcurrentReadsPerformance
     */
    public function testZZ_PrintBenchmarkSummary(): void
    {
        BenchmarkHelper::printSummary();
        $this->assertTrue(true);
    }
}
