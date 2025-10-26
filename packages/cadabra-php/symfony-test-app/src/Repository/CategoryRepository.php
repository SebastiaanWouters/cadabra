<?php

namespace App\Repository;

use App\Entity\Category;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<Category>
 */
class CategoryRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, Category::class);
    }

    /**
     * Find categories with product count (aggregate)
     */
    public function findWithProductCount(): array
    {
        return $this->createQueryBuilder('c')
            ->select('c', 'COUNT(p.id) as product_count')
            ->leftJoin('c.products', 'p')
            ->groupBy('c.id')
            ->orderBy('product_count', 'DESC')
            ->getQuery()
            ->getResult();
    }

    /**
     * Find category by name
     */
    public function findByName(string $name): ?Category
    {
        return $this->createQueryBuilder('c')
            ->where('c.name = :name')
            ->setParameter('name', $name)
            ->getQuery()
            ->getOneOrNullResult();
    }

    /**
     * Find categories with their products
     */
    public function findWithProducts(): array
    {
        return $this->createQueryBuilder('c')
            ->select('c', 'p')
            ->leftJoin('c.products', 'p')
            ->getQuery()
            ->getResult();
    }
}
