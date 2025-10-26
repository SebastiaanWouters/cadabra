<?php

namespace App\Tests\Fixtures;

use App\Entity\Category;
use App\Entity\Order;
use App\Entity\OrderItem;
use App\Entity\Product;
use App\Entity\Review;
use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;

class DataFixtures
{
    private EntityManagerInterface $entityManager;

    /** @var array<Category> */
    private array $categories = [];
    /** @var array<User> */
    private array $users = [];
    /** @var array<Product> */
    private array $products = [];
    /** @var array<Order> */
    private array $orders = [];

    public function __construct(EntityManagerInterface $entityManager)
    {
        $this->entityManager = $entityManager;
    }

    /**
     * Create minimal test data for basic tests
     */
    public function createMinimalData(): void
    {
        $this->createCategories(3);
        $this->createUsers(10);
        $this->createProducts(20);
        $this->createOrders(10);
        $this->createReviews(15);
        $this->entityManager->flush();
    }

    /**
     * Create comprehensive test data for integration tests
     */
    public function createIntegrationData(): void
    {
        $this->createCategories(5);
        $this->createUsers(50);
        $this->createProductsWithVariedPrices(100);
        $this->createOrders(50);
        $this->createReviews(100);
        $this->entityManager->flush();
    }

    /**
     * Create large dataset for benchmarking
     */
    public function createBenchmarkData(): void
    {
        echo "Creating benchmark dataset...\n";

        $this->createCategories(10);
        $this->entityManager->flush();

        $this->createUsers(100);
        $this->entityManager->flush();

        $this->createProductsWithVariedPrices(500);
        $this->entityManager->flush();

        $this->createOrders(200, 3);
        $this->entityManager->flush();

        $this->createReviews(300);
        $this->entityManager->flush();

        echo "Benchmark dataset created successfully\n";
    }

    private function createCategories(int $count): void
    {
        for ($i = 0; $i < $count; $i++) {
            $category = new Category();
            $category->setName("Category {$i}");
            $category->setDescription("Description for category {$i}");
            $this->entityManager->persist($category);
            $this->categories[] = $category;
        }
    }

    private function createUsers(int $count): void
    {
        for ($i = 0; $i < $count; $i++) {
            $user = new User();
            $user->setName("User {$i}");
            $user->setEmail("user{$i}@test.com");
            $this->entityManager->persist($user);
            $this->users[] = $user;
        }
    }

    private function createProducts(int $count): void
    {
        for ($i = 0; $i < $count; $i++) {
            $product = new Product();
            $product->setName("Product {$i}");
            $product->setPrice((string) (10 + ($i * 5)));
            $product->setStock(100 + $i);
            $product->setCategory($this->categories[$i % count($this->categories)]);
            $this->entityManager->persist($product);
            $this->products[] = $product;
        }
    }

    /**
     * Create products with prices distributed across different ranges
     * This ensures tests with different price ranges return different results
     */
    private function createProductsWithVariedPrices(int $count): void
    {
        $priceRanges = [
            ['min' => 10, 'max' => 50],      // Low price range
            ['min' => 51, 'max' => 100],     // Medium-low range
            ['min' => 101, 'max' => 200],    // Medium range
            ['min' => 201, 'max' => 500],    // High range
            ['min' => 501, 'max' => 1000],   // Premium range
        ];

        for ($i = 0; $i < $count; $i++) {
            $product = new Product();
            $product->setName("Product {$i}");

            // Distribute products across price ranges
            $rangeIndex = $i % count($priceRanges);
            $range = $priceRanges[$rangeIndex];
            $price = $range['min'] + (($i / count($priceRanges)) % ($range['max'] - $range['min']));

            $product->setPrice((string) round($price, 2));
            $product->setStock(100 + ($i % 50));

            // Get category by index - it should already be persisted
            $category = $this->categories[$i % count($this->categories)];
            $product->setCategory($category);

            $this->entityManager->persist($product);
            $this->products[] = $product;

            // Flush periodically to avoid memory issues
            if ($i % 100 === 0 && $i > 0) {
                $this->entityManager->flush();
            }
        }
    }

    private function createOrders(int $count, int $itemsPerOrder = 2): void
    {
        $statuses = ['pending', 'completed', 'shipped', 'cancelled'];

        for ($i = 0; $i < $count; $i++) {
            $order = new Order();
            $order->setUser($this->users[$i % count($this->users)]);
            $order->setStatus($statuses[$i % count($statuses)]);

            $orderTotal = 0;

            // Add order items
            for ($j = 0; $j < $itemsPerOrder; $j++) {
                $orderItem = new OrderItem();
                $orderItem->setOrder($order);
                $product = $this->products[($i * $itemsPerOrder + $j) % count($this->products)];
                $orderItem->setProduct($product);
                $orderItem->setQuantity($j + 1);
                $orderItem->setPrice($product->getPrice());
                $this->entityManager->persist($orderItem);

                $orderTotal += (float)$product->getPrice() * ($j + 1);
            }

            $order->setTotal((string) $orderTotal);
            $this->entityManager->persist($order);
            $this->orders[] = $order;
        }
    }

    private function createReviews(int $count): void
    {
        $ratings = [1, 2, 3, 4, 5];

        for ($i = 0; $i < $count; $i++) {
            $review = new Review();
            $review->setProduct($this->products[$i % count($this->products)]);
            $review->setUser($this->users[$i % count($this->users)]);
            $review->setRating($ratings[$i % count($ratings)]);
            $review->setComment("Review comment {$i}");
            $this->entityManager->persist($review);
        }
    }


    public function getCategories(): array
    {
        return $this->categories;
    }

    public function getUsers(): array
    {
        return $this->users;
    }

    public function getProducts(): array
    {
        return $this->products;
    }

    public function getOrders(): array
    {
        return $this->orders;
    }
}
