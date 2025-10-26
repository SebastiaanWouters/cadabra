<?php

namespace App\Repository;

use App\Entity\Order;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<Order>
 */
class OrderRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, Order::class);
    }

    /**
     * Find orders with user and items (complex multi-table JOIN)
     */
    public function findWithUserAndItems(int $limit = 10): array
    {
        return $this->createQueryBuilder('o')
            ->select('o', 'u', 'i', 'p')
            ->join('o.user', 'u')
            ->leftJoin('o.items', 'i')
            ->leftJoin('i.product', 'p')
            ->setMaxResults($limit)
            ->getQuery()
            ->getResult();
    }

    /**
     * Find orders by user ID
     */
    public function findByUserId(int $userId): array
    {
        return $this->createQueryBuilder('o')
            ->where('o.user = :userId')
            ->setParameter('userId', $userId)
            ->orderBy('o.createdAt', 'DESC')
            ->getQuery()
            ->getResult();
    }

    /**
     * Find orders by status
     */
    public function findByStatus(string $status): array
    {
        return $this->createQueryBuilder('o')
            ->where('o.status = :status')
            ->setParameter('status', $status)
            ->orderBy('o.createdAt', 'DESC')
            ->getQuery()
            ->getResult();
    }

    /**
     * Get total sales by date range (aggregate query)
     */
    public function getTotalSalesByDateRange(\DateTimeImmutable $start, \DateTimeImmutable $end): string
    {
        $result = $this->createQueryBuilder('o')
            ->select('SUM(o.total) as total_sales')
            ->where('o.createdAt >= :start')
            ->andWhere('o.createdAt <= :end')
            ->setParameter('start', $start)
            ->setParameter('end', $end)
            ->getQuery()
            ->getSingleScalarResult();

        return $result ?? '0.00';
    }

    /**
     * Get sales statistics by status (GROUP BY aggregate)
     */
    public function getSalesByStatus(): array
    {
        return $this->createQueryBuilder('o')
            ->select('o.status', 'COUNT(o.id) as order_count', 'SUM(o.total) as total_sales')
            ->groupBy('o.status')
            ->orderBy('total_sales', 'DESC')
            ->getQuery()
            ->getResult();
    }

    /**
     * Find recent orders with user details
     */
    public function findRecentWithUsers(int $days = 30, int $limit = 100): array
    {
        $since = new \DateTimeImmutable("-{$days} days");

        return $this->createQueryBuilder('o')
            ->select('o', 'u')
            ->join('o.user', 'u')
            ->where('o.createdAt >= :since')
            ->setParameter('since', $since)
            ->orderBy('o.createdAt', 'DESC')
            ->setMaxResults($limit)
            ->getQuery()
            ->getResult();
    }

    /**
     * Get top customers by order count (complex aggregate)
     */
    public function getTopCustomersByOrderCount(int $limit = 10): array
    {
        return $this->createQueryBuilder('o')
            ->select('u.id as user_id', 'u.name', 'u.email', 'COUNT(o.id) as order_count', 'SUM(o.total) as total_spent')
            ->join('o.user', 'u')
            ->groupBy('u.id')
            ->orderBy('order_count', 'DESC')
            ->setMaxResults($limit)
            ->getQuery()
            ->getResult();
    }

    /**
     * Find orders above a certain total
     */
    public function findLargeOrders(string $minTotal = '100.00'): array
    {
        return $this->createQueryBuilder('o')
            ->where('o.total >= :minTotal')
            ->setParameter('minTotal', $minTotal)
            ->orderBy('o.total', 'DESC')
            ->getQuery()
            ->getResult();
    }
}
