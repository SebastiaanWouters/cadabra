<?php

namespace App\DataFixtures;

use App\Entity\Category;
use App\Entity\Order;
use App\Entity\OrderItem;
use App\Entity\Product;
use App\Entity\Review;
use App\Entity\User;
use Doctrine\Bundle\FixturesBundle\Fixture;
use Doctrine\Persistence\ObjectManager;
use Faker\Factory;
use Faker\Generator;

class AppFixtures extends Fixture
{
    private Generator $faker;
    private array $users = [];
    private array $categories = [];
    private array $products = [];
    private array $orders = [];

    public function __construct()
    {
        $this->faker = Factory::create();
    }

    public function load(ObjectManager $manager): void
    {
        echo "Creating categories...\n";
        $this->createCategories($manager, 50);

        echo "Creating users...\n";
        $this->createUsers($manager, 10000);

        echo "Creating products...\n";
        $this->createProducts($manager, 5000);

        echo "Creating orders...\n";
        $this->createOrders($manager, 50000);

        echo "Creating reviews...\n";
        $this->createReviews($manager, 25000);

        echo "Flushing data...\n";
        $manager->flush();

        echo "Fixtures loaded successfully!\n";
    }

    private function createCategories(ObjectManager $manager, int $count): void
    {
        $categoryNames = [
            'Electronics',
            'Clothing',
            'Books',
            'Home & Garden',
            'Sports & Outdoors',
            'Toys & Games',
            'Health & Beauty',
            'Automotive',
            'Food & Beverages',
            'Office Supplies',
            'Pet Supplies',
            'Jewelry',
            'Music',
            'Movies',
            'Video Games',
            'Tools & Hardware',
            'Arts & Crafts',
            'Baby Products',
            'Shoes',
            'Watches',
        ];

        for ($i = 0; $i < $count; $i++) {
            $category = new Category();
            $category->setName($i < count($categoryNames) ? $categoryNames[$i] : $this->faker->words(2, true));
            $category->setDescription($this->faker->sentence(10));

            $manager->persist($category);
            $this->categories[] = $category;

            if ($i % 10 === 0) {
                $manager->flush();
                $manager->clear(Category::class);
            }
        }

        $manager->flush();
        $manager->clear(Category::class);
    }

    private function createUsers(ObjectManager $manager, int $count): void
    {
        for ($i = 0; $i < $count; $i++) {
            $user = new User();
            $user->setName($this->faker->name());
            $user->setEmail($this->faker->unique()->email());
            $user->setCreatedAt($this->faker->dateTimeBetween('-2 years', 'now', null));

            $manager->persist($user);
            $this->users[] = $user;

            if ($i % 1000 === 0 && $i > 0) {
                echo "  Created {$i} users...\n";
                $manager->flush();
                $manager->clear(User::class);
            }
        }

        $manager->flush();
        $manager->clear(User::class);
    }

    private function createProducts(ObjectManager $manager, int $count): void
    {
        for ($i = 0; $i < $count; $i++) {
            $product = new Product();
            $product->setName($this->faker->words(3, true));
            $product->setDescription($this->faker->sentence(15));
            $product->setPrice($this->faker->randomFloat(2, 5, 500));
            $product->setStock($this->faker->numberBetween(0, 1000));
            $product->setCategory($this->categories[array_rand($this->categories)]);

            $manager->persist($product);
            $this->products[] = $product;

            if ($i % 1000 === 0 && $i > 0) {
                echo "  Created {$i} products...\n";
                $manager->flush();
                $manager->clear(Product::class);
            }
        }

        $manager->flush();
        $manager->clear(Product::class);
    }

    private function createOrders(ObjectManager $manager, int $count): void
    {
        $statuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];

        for ($i = 0; $i < $count; $i++) {
            $order = new Order();
            $order->setUser($this->users[array_rand($this->users)]);
            $order->setStatus($statuses[array_rand($statuses)]);
            $order->setCreatedAt($this->faker->dateTimeBetween('-1 year', 'now', null));

            $itemCount = $this->faker->numberBetween(1, 5);
            $total = 0;

            for ($j = 0; $j < $itemCount; $j++) {
                $product = $this->products[array_rand($this->products)];
                $quantity = $this->faker->numberBetween(1, 3);
                $price = $this->faker->randomFloat(2, 5, 500);

                $orderItem = new OrderItem();
                $orderItem->setProduct($product);
                $orderItem->setQuantity($quantity);
                $orderItem->setPrice($price);
                $orderItem->setOrder($order);

                $order->addItem($orderItem);
                $manager->persist($orderItem);

                $total += $price * $quantity;
            }

            $order->setTotal((string) $total);
            $manager->persist($order);
            $this->orders[] = $order;

            if ($i % 1000 === 0 && $i > 0) {
                echo "  Created {$i} orders...\n";
                $manager->flush();
                $manager->clear(Order::class);
                $manager->clear(OrderItem::class);
            }
        }

        $manager->flush();
        $manager->clear(Order::class);
        $manager->clear(OrderItem::class);
    }

    private function createReviews(ObjectManager $manager, int $count): void
    {
        for ($i = 0; $i < $count; $i++) {
            $review = new Review();
            $review->setProduct($this->products[array_rand($this->products)]);
            $review->setUser($this->users[array_rand($this->users)]);
            $review->setRating($this->faker->numberBetween(1, 5));
            $review->setComment($this->faker->optional(0.7)->paragraph());
            $review->setCreatedAt($this->faker->dateTimeBetween('-1 year', 'now', null));

            $manager->persist($review);

            if ($i % 1000 === 0 && $i > 0) {
                echo "  Created {$i} reviews...\n";
                $manager->flush();
                $manager->clear(Review::class);
            }
        }

        $manager->flush();
        $manager->clear(Review::class);
    }
}
