<?php

namespace App\Repository;

use App\Entity\OrderItem;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<OrderItem>
 */
class OrderItemRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, OrderItem::class);
    }

    /**
     * Get best selling products (aggregate with JOIN)
     */
    public function getBestSellingProducts(int $limit = 10): array
    {
        return $this->createQueryBuilder('oi')
            ->select('p.id as product_id', 'p.name', 'SUM(oi.quantity) as total_quantity', 'COUNT(oi.id) as order_count')
            ->join('oi.product', 'p')
            ->groupBy('p.id')
            ->orderBy('total_quantity', 'DESC')
            ->setMaxResults($limit)
            ->getQuery()
            ->getResult();
    }

    /**
     * Find items by product ID
     */
    public function findByProductId(int $productId): array
    {
        return $this->createQueryBuilder('oi')
            ->where('oi.product = :productId')
            ->setParameter('productId', $productId)
            ->getQuery()
            ->getResult();
    }

    /**
     * Get revenue by product (aggregate)
     */
    public function getRevenueByProduct(int $limit = 20): array
    {
        return $this->createQueryBuilder('oi')
            ->select('p.id as product_id', 'p.name', 'SUM(oi.price * oi.quantity) as total_revenue')
            ->join('oi.product', 'p')
            ->groupBy('p.id')
            ->orderBy('total_revenue', 'DESC')
            ->setMaxResults($limit)
            ->getQuery()
            ->getResult();
    }
}
