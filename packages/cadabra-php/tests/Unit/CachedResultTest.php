<?php

declare(strict_types=1);

namespace Cadabra\Tests\Unit;

use Cadabra\SymfonyBundle\Middleware\CachedResult;
use PHPUnit\Framework\TestCase;

class CachedResultTest extends TestCase
{
    private array $sampleRows;

    protected function setUp(): void
    {
        $this->sampleRows = [
            ['id' => 1, 'name' => 'John', 'email' => 'john@example.com'],
            ['id' => 2, 'name' => 'Jane', 'email' => 'jane@example.com'],
            ['id' => 3, 'name' => 'Bob', 'email' => 'bob@example.com'],
        ];
    }

    public function testFetchAllAssociative(): void
    {
        $result = new CachedResult($this->sampleRows);

        $this->assertEquals($this->sampleRows, $result->fetchAllAssociative());
    }

    public function testFetchAssociative(): void
    {
        $result = new CachedResult($this->sampleRows);

        $this->assertEquals($this->sampleRows[0], $result->fetchAssociative());
        $this->assertEquals($this->sampleRows[1], $result->fetchAssociative());
        $this->assertEquals($this->sampleRows[2], $result->fetchAssociative());
        $this->assertFalse($result->fetchAssociative());
    }

    public function testFetchNumeric(): void
    {
        $result = new CachedResult($this->sampleRows);

        $this->assertEquals([1, 'John', 'john@example.com'], $result->fetchNumeric());
        $this->assertEquals([2, 'Jane', 'jane@example.com'], $result->fetchNumeric());
        $this->assertEquals([3, 'Bob', 'bob@example.com'], $result->fetchNumeric());
        $this->assertFalse($result->fetchNumeric());
    }

    public function testFetchOne(): void
    {
        $result = new CachedResult($this->sampleRows);

        $this->assertEquals(1, $result->fetchOne());
    }

    public function testFetchFirstColumn(): void
    {
        $result = new CachedResult($this->sampleRows);

        $this->assertEquals([1, 2, 3], $result->fetchFirstColumn());
    }

    public function testRowCount(): void
    {
        $result = new CachedResult($this->sampleRows);

        $this->assertEquals(3, $result->rowCount());
    }

    public function testColumnCount(): void
    {
        $result = new CachedResult($this->sampleRows);

        $this->assertEquals(3, $result->columnCount());
    }

    public function testFree(): void
    {
        $result = new CachedResult($this->sampleRows);

        $result->free();

        $this->assertEquals(0, $result->rowCount());
        $this->assertFalse($result->fetchAssociative());
    }

    public function testEmptyResult(): void
    {
        $result = new CachedResult([]);

        $this->assertEquals([], $result->fetchAllAssociative());
        $this->assertFalse($result->fetchAssociative());
        $this->assertEquals(0, $result->rowCount());
        $this->assertEquals(0, $result->columnCount());
        $this->assertEquals([], $result->fetchFirstColumn());
    }
}
