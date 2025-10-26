<?php

namespace App\Repository;

use App\Entity\Product;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<Product>
 */
class ProductRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, Product::class);
    }

    /**
     * Find products by category (for testing JOIN queries)
     */
    public function findByCategory(int $categoryId): array
    {
        return $this->createQueryBuilder('p')
            ->where('p.category = :categoryId')
            ->setParameter('categoryId', $categoryId)
            ->orderBy('p.name', 'ASC')
            ->getQuery()
            ->getResult();
    }

    /**
     * Find products with category data (eager loading)
     */
    public function findWithCategory(int $limit = 10): array
    {
        return $this->createQueryBuilder('p')
            ->select('p', 'c')
            ->join('p.category', 'c')
            ->setMaxResults($limit)
            ->getQuery()
            ->getResult();
    }

    /**
     * Find products with reviews and ratings (complex JOIN)
     */
    public function findWithReviews(int $productId): ?Product
    {
        return $this->createQueryBuilder('p')
            ->select('p', 'r', 'u')
            ->leftJoin('p.reviews', 'r')
            ->leftJoin('r.user', 'u')
            ->where('p.id = :id')
            ->setParameter('id', $productId)
            ->getQuery()
            ->getOneOrNullResult();
    }

    /**
     * Find products in price range
     */
    public function findInPriceRange(string $minPrice, string $maxPrice): array
    {
        return $this->createQueryBuilder('p')
            ->where('p.price >= :min')
            ->andWhere('p.price <= :max')
            ->setParameter('min', $minPrice)
            ->setParameter('max', $maxPrice)
            ->orderBy('p.price', 'ASC')
            ->getQuery()
            ->getResult();
    }

    /**
     * Find low stock products
     */
    public function findLowStock(int $threshold = 10): array
    {
        return $this->createQueryBuilder('p')
            ->where('p.stock < :threshold')
            ->setParameter('threshold', $threshold)
            ->orderBy('p.stock', 'ASC')
            ->getQuery()
            ->getResult();
    }

    /**
     * Get average price by category (aggregate query)
     */
    public function getAveragePriceByCategory(): array
    {
        return $this->createQueryBuilder('p')
            ->select('c.name as category_name', 'AVG(p.price) as avg_price', 'COUNT(p.id) as product_count')
            ->join('p.category', 'c')
            ->groupBy('c.id')
            ->orderBy('avg_price', 'DESC')
            ->getQuery()
            ->getResult();
    }

    /**
     * Search products by name
     */
    public function searchByName(string $query): array
    {
        return $this->createQueryBuilder('p')
            ->where('p.name LIKE :query')
            ->setParameter('query', '%' . $query . '%')
            ->setMaxResults(20)
            ->getQuery()
            ->getResult();
    }
}
