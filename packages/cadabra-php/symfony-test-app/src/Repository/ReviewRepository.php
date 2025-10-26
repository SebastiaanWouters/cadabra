<?php

namespace App\Repository;

use App\Entity\Review;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<Review>
 */
class ReviewRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, Review::class);
    }

    /**
     * Find reviews for a product
     */
    public function findByProduct(int $productId): array
    {
        return $this->createQueryBuilder('r')
            ->where('r.product = :productId')
            ->setParameter('productId', $productId)
            ->orderBy('r.createdAt', 'DESC')
            ->getQuery()
            ->getResult();
    }

    /**
     * Find reviews with user and product data (multi-table JOIN)
     */
    public function findWithUserAndProduct(int $limit = 10): array
    {
        return $this->createQueryBuilder('r')
            ->select('r', 'u', 'p')
            ->join('r.user', 'u')
            ->join('r.product', 'p')
            ->setMaxResults($limit)
            ->getQuery()
            ->getResult();
    }

    /**
     * Get average rating by product (aggregate)
     */
    public function getAverageRatingByProduct(): array
    {
        return $this->createQueryBuilder('r')
            ->select('p.id as product_id', 'p.name', 'AVG(r.rating) as avg_rating', 'COUNT(r.id) as review_count')
            ->join('r.product', 'p')
            ->groupBy('p.id')
            ->having('COUNT(r.id) >= :minReviews')
            ->setParameter('minReviews', 5)
            ->orderBy('avg_rating', 'DESC')
            ->getQuery()
            ->getResult();
    }

    /**
     * Find high rated products (aggregate with HAVING clause)
     */
    public function findHighRatedProducts(float $minRating = 4.0): array
    {
        return $this->createQueryBuilder('r')
            ->select('p.id as product_id', 'p.name', 'AVG(r.rating) as avg_rating', 'COUNT(r.id) as review_count')
            ->join('r.product', 'p')
            ->groupBy('p.id')
            ->having('AVG(r.rating) >= :minRating')
            ->andHaving('COUNT(r.id) >= 3')
            ->setParameter('minRating', $minRating)
            ->orderBy('avg_rating', 'DESC')
            ->getQuery()
            ->getResult();
    }

    /**
     * Find reviews by user
     */
    public function findByUser(int $userId): array
    {
        return $this->createQueryBuilder('r')
            ->where('r.user = :userId')
            ->setParameter('userId', $userId)
            ->orderBy('r.createdAt', 'DESC')
            ->getQuery()
            ->getResult();
    }

    /**
     * Find recent reviews
     */
    public function findRecent(int $days = 7, int $limit = 20): array
    {
        $since = new \DateTimeImmutable("-{$days} days");

        return $this->createQueryBuilder('r')
            ->select('r', 'u', 'p')
            ->join('r.user', 'u')
            ->join('r.product', 'p')
            ->where('r.createdAt >= :since')
            ->setParameter('since', $since)
            ->orderBy('r.createdAt', 'DESC')
            ->setMaxResults($limit)
            ->getQuery()
            ->getResult();
    }
}
