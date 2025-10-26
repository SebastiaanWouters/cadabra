<?php

namespace App\Tests\Integration;

use App\Entity\Category;
use App\Entity\Order;
use App\Entity\OrderItem;
use App\Entity\Product;
use App\Entity\Review;
use App\Entity\User;
use App\Repository\OrderRepository;
use App\Repository\ProductRepository;
use App\Repository\ReviewRepository;
use App\Repository\UserRepository;
use App\Tests\BaseTestCase;

class DoctrineORMIntegrationTest extends BaseTestCase
{
    private UserRepository $userRepository;
    private ProductRepository $productRepository;
    private OrderRepository $orderRepository;
    private ReviewRepository $reviewRepository;

    protected function setUp(): void
    {
        parent::setUp();

        $this->userRepository = $this->entityManager->getRepository(User::class);
        $this->productRepository = $this->entityManager->getRepository(Product::class);
        $this->orderRepository = $this->entityManager->getRepository(Order::class);
        $this->reviewRepository = $this->entityManager->getRepository(Review::class);

        $this->setupTestData();
    }

    private function setupTestData(): void
    {
        // Create categories
        $electronics = new Category();
        $electronics->setName('Electronics');
        $electronics->setDescription('Electronic products');
        $this->entityManager->persist($electronics);

        $books = new Category();
        $books->setName('Books');
        $books->setDescription('Books and literature');
        $this->entityManager->persist($books);

        // Create users
        $user1 = new User();
        $user1->setName('John Doe');
        $user1->setEmail('john@example.com');
        $this->entityManager->persist($user1);

        $user2 = new User();
        $user2->setName('Jane Smith');
        $user2->setEmail('jane@example.com');
        $this->entityManager->persist($user2);

        // Create products
        $product1 = new Product();
        $product1->setName('Laptop');
        $product1->setPrice('999.99');
        $product1->setStock(10);
        $product1->setCategory($electronics);
        $this->entityManager->persist($product1);

        $product2 = new Product();
        $product2->setName('Mouse');
        $product2->setPrice('29.99');
        $product2->setStock(50);
        $product2->setCategory($electronics);
        $this->entityManager->persist($product2);

        $product3 = new Product();
        $product3->setName('Programming Book');
        $product3->setPrice('49.99');
        $product3->setStock(20);
        $product3->setCategory($books);
        $this->entityManager->persist($product3);

        // Create orders
        $order1 = new Order();
        $order1->setUser($user1);
        $order1->setStatus('completed');
        $order1->setTotal('1029.98');
        $this->entityManager->persist($order1);

        $orderItem1 = new OrderItem();
        $orderItem1->setOrder($order1);
        $orderItem1->setProduct($product1);
        $orderItem1->setQuantity(1);
        $orderItem1->setPrice('999.99');
        $this->entityManager->persist($orderItem1);

        $orderItem2 = new OrderItem();
        $orderItem2->setOrder($order1);
        $orderItem2->setProduct($product2);
        $orderItem2->setQuantity(1);
        $orderItem2->setPrice('29.99');
        $this->entityManager->persist($orderItem2);

        // Create reviews
        $review1 = new Review();
        $review1->setProduct($product1);
        $review1->setUser($user1);
        $review1->setRating(5);
        $review1->setComment('Excellent laptop!');
        $this->entityManager->persist($review1);

        $review2 = new Review();
        $review2->setProduct($product1);
        $review2->setUser($user2);
        $review2->setRating(4);
        $review2->setComment('Good value for money');
        $this->entityManager->persist($review2);

        $this->entityManager->flush();
        $this->entityManager->clear();
    }

    public function testEntityCRUDOperations(): void
    {
        // Create
        $newUser = new User();
        $newUser->setName('Test User');
        $newUser->setEmail('test@example.com');
        $this->entityManager->persist($newUser);
        $this->entityManager->flush();

        $userId = $newUser->getId();
        $this->assertNotNull($userId);

        // Read
        $this->refreshEntityManager();
        $fetchedUser = $this->userRepository->find($userId);
        $this->assertNotNull($fetchedUser);
        $this->assertEquals('Test User', $fetchedUser->getName());

        // Update
        $fetchedUser->setName('Updated User');
        $this->entityManager->flush();

        $this->refreshEntityManager();
        $updatedUser = $this->userRepository->find($userId);
        $this->assertEquals('Updated User', $updatedUser->getName());

        // Delete
        $this->entityManager->remove($updatedUser);
        $this->entityManager->flush();

        $this->refreshEntityManager();
        $deletedUser = $this->userRepository->find($userId);
        $this->assertNull($deletedUser);
    }

    public function testLazyLoadingRelationships(): void
    {
        $user = $this->userRepository->findByEmail('john@example.com');
        $this->assertNotNull($user);

        // Lazy load orders (should trigger query)
        $orders = $user->getOrders();
        $this->assertCount(1, $orders);

        $order = $orders->first();
        $this->assertEquals('completed', $order->getStatus());
    }

    public function testEagerLoadingWithJoins(): void
    {
        // Eager load with explicit JOIN
        $products = $this->productRepository->findWithCategory(3);
        $this->assertCount(3, $products);

        // Category should be loaded without additional query
        foreach ($products as $product) {
            $this->assertNotNull($product->getCategory());
            $this->assertNotNull($product->getCategory()->getName());
        }
    }

    public function testComplexJoinQuery(): void
    {
        $orders = $this->orderRepository->findWithUserAndItems(10);
        $this->assertGreaterThan(0, count($orders));

        foreach ($orders as $order) {
            $this->assertNotNull($order->getUser());
            $this->assertNotNull($order->getItems());

            foreach ($order->getItems() as $item) {
                $this->assertNotNull($item->getProduct());
            }
        }
    }

    public function testDQLQuery(): void
    {
        $dql = 'SELECT u, o FROM App\Entity\User u LEFT JOIN u.orders o WHERE u.email = :email';
        $query = $this->entityManager->createQuery($dql);
        $query->setParameter('email', 'john@example.com');

        $result = $query->getResult();
        $this->assertNotEmpty($result);
        $this->assertInstanceOf(User::class, $result[0]);
    }

    public function testAggregateQueries(): void
    {
        // Count query
        $dql = 'SELECT COUNT(p.id) FROM App\Entity\Product p';
        $count = $this->entityManager->createQuery($dql)->getSingleScalarResult();
        $this->assertEquals(3, $count);

        // Sum query
        $dql = 'SELECT SUM(o.total) FROM App\Entity\Order o';
        $total = $this->entityManager->createQuery($dql)->getSingleScalarResult();
        $this->assertEquals('1029.98', $total);

        // Group by query
        $dql = 'SELECT c.name, COUNT(p.id) as product_count FROM App\Entity\Product p JOIN p.category c GROUP BY c.id';
        $result = $this->entityManager->createQuery($dql)->getResult();
        $this->assertCount(2, $result);
    }

    public function testRepositoryCustomMethods(): void
    {
        // Test UserRepository methods
        $user = $this->userRepository->findByEmail('jane@example.com');
        $this->assertNotNull($user);
        $this->assertEquals('Jane Smith', $user->getName());

        // Test ProductRepository methods
        $electronics = $this->entityManager->getRepository(Category::class)->findByName('Electronics');
        $products = $this->productRepository->findByCategory($electronics->getId());
        $this->assertCount(2, $products);

        // Test price range
        $priceRangeProducts = $this->productRepository->findInPriceRange('20', '100');
        $this->assertGreaterThan(0, count($priceRangeProducts));
    }

    public function testCascadeOperations(): void
    {
        // Create order with items using cascade persist
        $user = $this->userRepository->findByEmail('jane@example.com');
        $product = $this->productRepository->findOneBy(['name' => 'Mouse']);

        $order = new Order();
        $order->setUser($user);
        $order->setStatus('pending');
        $order->setTotal('29.99');

        $orderItem = new OrderItem();
        $orderItem->setProduct($product);
        $orderItem->setQuantity(1);
        $orderItem->setPrice('29.99');
        $order->addItem($orderItem);

        // Only persist order, items should be cascaded
        $this->entityManager->persist($order);
        $this->entityManager->flush();

        $orderId = $order->getId();
        $this->assertNotNull($orderId);

        // Verify cascade worked
        $this->refreshEntityManager();
        $savedOrder = $this->orderRepository->find($orderId);
        $this->assertNotNull($savedOrder);
        $this->assertCount(1, $savedOrder->getItems());
    }

    public function testBidirectionalRelationships(): void
    {
        $product = $this->productRepository->findOneBy(['name' => 'Laptop']);
        $this->assertNotNull($product);

        // Check bidirectional relationship: Product -> Reviews
        $reviews = $product->getReviews();
        $this->assertCount(2, $reviews);

        // Check reverse: Review -> Product
        $review = $reviews->first();
        $this->assertEquals($product->getId(), $review->getProduct()->getId());
    }

    public function testQueryBuilder(): void
    {
        // Complex query builder example
        $qb = $this->entityManager->createQueryBuilder();
        $qb->select('p', 'c')
            ->from(Product::class, 'p')
            ->join('p.category', 'c')
            ->where('p.stock > :minStock')
            ->andWhere('c.name = :categoryName')
            ->setParameter('minStock', 15)
            ->setParameter('categoryName', 'Books')
            ->orderBy('p.price', 'DESC');

        $result = $qb->getQuery()->getResult();
        $this->assertCount(1, $result);
        $this->assertEquals('Programming Book', $result[0]->getName());
    }

    public function testPartialObjectQueries(): void
    {
        // Partial object selection for performance
        $dql = 'SELECT partial u.{id, name, email} FROM App\Entity\User u WHERE u.id = :id';
        $query = $this->entityManager->createQuery($dql);

        $user = $this->userRepository->findByEmail('john@example.com');
        $query->setParameter('id', $user->getId());

        $result = $query->getOneOrNullResult();
        $this->assertNotNull($result);
        $this->assertEquals($user->getName(), $result->getName());
    }

    public function testNativeSQL(): void
    {
        $sql = 'SELECT * FROM users WHERE email = :email';
        $rsm = new \Doctrine\ORM\Query\ResultSetMapping();
        $rsm->addEntityResult(User::class, 'u');
        $rsm->addFieldResult('u', 'id', 'id');
        $rsm->addFieldResult('u', 'name', 'name');
        $rsm->addFieldResult('u', 'email', 'email');
        $rsm->addFieldResult('u', 'created_at', 'createdAt');

        $query = $this->entityManager->createNativeQuery($sql, $rsm);
        $query->setParameter('email', 'john@example.com');

        $result = $query->getResult();
        $this->assertNotEmpty($result);
        $this->assertInstanceOf(User::class, $result[0]);
    }
}
