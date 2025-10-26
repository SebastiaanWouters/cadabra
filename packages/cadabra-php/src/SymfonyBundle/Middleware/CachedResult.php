<?php

declare(strict_types=1);

namespace Cadabra\SymfonyBundle\Middleware;

use Doctrine\DBAL\Driver\Result;

/**
 * Fake Result object backed by cached data.
 * Doctrine hydrates entities from this without knowing the data came from cache.
 */
class CachedResult implements Result
{
    /** @var array<int, array<string, mixed>> */
    private array $rows;
    private int $position = 0;

    /**
     * @param array<int, array<string, mixed>> $rows Raw database rows from cache
     */
    public function __construct(array $rows)
    {
        $this->rows = $rows;
    }

    /**
     * {@inheritdoc}
     */
    public function fetchAllAssociative(): array
    {
        return $this->rows;
    }

    /**
     * {@inheritdoc}
     */
    public function fetchAssociative(): array|false
    {
        if ($this->position >= count($this->rows)) {
            return false;
        }

        return $this->rows[$this->position++];
    }

    /**
     * {@inheritdoc}
     */
    public function fetchNumeric(): array|false
    {
        $row = $this->fetchAssociative();
        return $row !== false ? array_values($row) : false;
    }

    /**
     * {@inheritdoc}
     */
    public function fetchAllNumeric(): array
    {
        return array_map('array_values', $this->rows);
    }

    /**
     * {@inheritdoc}
     */
    public function fetchOne(): mixed
    {
        $row = $this->fetchNumeric();
        return $row !== false ? ($row[0] ?? false) : false;
    }

    /**
     * {@inheritdoc}
     */
    public function fetchFirstColumn(): array
    {
        if (empty($this->rows)) {
            return [];
        }

        $firstKey = array_key_first($this->rows[0] ?? []);
        if ($firstKey === null) {
            return [];
        }

        return array_column($this->rows, $firstKey);
    }

    /**
     * {@inheritdoc}
     */
    public function rowCount(): int
    {
        return count($this->rows);
    }

    /**
     * {@inheritdoc}
     */
    public function columnCount(): int
    {
        return empty($this->rows) ? 0 : count($this->rows[0] ?? []);
    }

    /**
     * {@inheritdoc}
     */
    public function free(): void
    {
        $this->rows = [];
        $this->position = 0;
    }
}
