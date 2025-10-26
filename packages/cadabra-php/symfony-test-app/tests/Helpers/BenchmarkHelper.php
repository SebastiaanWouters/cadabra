<?php

namespace App\Tests\Helpers;

class BenchmarkHelper
{
    private const WARMUP_RUNS = 5;
    private const BENCHMARK_RUNS = 50;

    /** @var array<array{scenario: string, withoutCache: float, withCache: float, speedup: float}> */
    private static array $results = [];

    /**
     * Run a benchmark comparing cached vs non-cached performance
     *
     * @param string $scenario Name of the benchmark scenario
     * @param callable $setupFn Function to set up the test data
     * @param callable $benchmarkFn Function to run the benchmark query
     * @param bool $disableCacheForComparison Whether to actually disable cache for comparison
     * @return array{withoutCache: float, withCache: float, speedup: float}
     */
    public static function benchmark(
        string $scenario,
        callable $setupFn,
        callable $benchmarkFn,
        bool $disableCacheForComparison = false
    ): array {
        self::printHeader($scenario);

        // Setup data once
        $setupFn();

        $withoutCacheTime = 0;
        $withCacheTime = 0;

        if ($disableCacheForComparison) {
            // Benchmark WITHOUT cache (if we can disable it)
            echo "Running " . self::BENCHMARK_RUNS . " iterations without cache...\n";
            // Note: In Symfony, we can't easily disable DBAL middleware,
            // so this would require additional infrastructure
            $withoutCacheTime = self::runBenchmark($benchmarkFn);
        } else {
            // For Symfony tests, we'll measure the first cold run
            echo "Measuring cold cache performance (first run)...\n";
            $withoutCacheTime = self::measureExecution($benchmarkFn);
        }

        // Warmup cache
        echo "Warming up cache with " . self::WARMUP_RUNS . " runs...\n";
        for ($i = 0; $i < self::WARMUP_RUNS; $i++) {
            $benchmarkFn();
        }

        // Benchmark WITH cache
        echo "Running " . self::BENCHMARK_RUNS . " iterations with cache...\n";
        $withCacheTime = self::runBenchmark($benchmarkFn);

        $speedup = $withoutCacheTime > 0 ? $withoutCacheTime / $withCacheTime : 1;

        $result = [
            'scenario' => $scenario,
            'withoutCache' => $withoutCacheTime,
            'withCache' => $withCacheTime,
            'speedup' => $speedup,
        ];

        self::printResults($result);
        self::$results[] = $result;

        return $result;
    }

    /**
     * Run benchmark iterations and return total time in milliseconds
     */
    private static function runBenchmark(callable $fn): float
    {
        $start = microtime(true);

        for ($i = 0; $i < self::BENCHMARK_RUNS; $i++) {
            $fn();
        }

        return (microtime(true) - $start) * 1000; // Convert to ms
    }

    /**
     * Measure single execution time in milliseconds
     */
    private static function measureExecution(callable $fn): float
    {
        $start = microtime(true);
        $fn();
        return (microtime(true) - $start) * 1000 * self::BENCHMARK_RUNS; // Normalize to match benchmark runs
    }

    private static function printHeader(string $scenario): void
    {
        echo "\n" . str_repeat("=", 70) . "\n";
        echo "📊 {$scenario}\n";
        echo str_repeat("=", 70) . "\n";
    }

    /**
     * @param array{scenario: string, withoutCache: float, withCache: float, speedup: float} $result
     */
    private static function printResults(array $result): void
    {
        echo "\nCold/First Run:  " . self::formatTime($result['withoutCache']) . " total\n";
        echo "   (" . self::formatTime($result['withoutCache'] / self::BENCHMARK_RUNS) . " per query)\n";

        echo "\nWith Cache:      " . self::formatTime($result['withCache']) . " total\n";
        echo "   (" . self::formatTime($result['withCache'] / self::BENCHMARK_RUNS) . " per query)\n";

        echo "\n⚡ Speedup: " . number_format($result['speedup'], 1) . "x faster\n";
        echo str_repeat("=", 70) . "\n";
    }

    private static function formatTime(float $ms): string
    {
        if ($ms < 1) {
            return number_format($ms * 1000, 2) . 'µs';
        }
        if ($ms < 1000) {
            return number_format($ms, 2) . 'ms';
        }
        return number_format($ms / 1000, 2) . 's';
    }

    /**
     * Print summary of all benchmark results
     */
    public static function printSummary(): void
    {
        if (empty(self::$results)) {
            return;
        }

        echo "\n\n" . str_repeat("█", 80) . "\n";
        echo "                    BENCHMARK SUMMARY\n";
        echo str_repeat("█", 80) . "\n\n";

        echo str_pad("Scenario", 60) . str_pad("Speedup", 8) . "\n";
        echo str_repeat("-", 80) . "\n";

        foreach (self::$results as $result) {
            $scenarioText = substr($result['scenario'], 0, 55);
            $speedupText = number_format($result['speedup'], 1) . 'x';
            echo str_pad($scenarioText, 60) . str_pad($speedupText, 8) . "\n";
        }

        echo str_repeat("-", 80) . "\n";

        $avgSpeedup = array_sum(array_column(self::$results, 'speedup')) / count(self::$results);
        echo str_pad("AVERAGE SPEEDUP", 60) . str_pad(number_format($avgSpeedup, 1) . 'x', 8) . "\n";

        echo "\n" . str_repeat("█", 80) . "\n";

        // Calculate total time saved
        $totalWithoutCache = array_sum(array_column(self::$results, 'withoutCache'));
        $totalWithCache = array_sum(array_column(self::$results, 'withCache'));
        $timeSaved = $totalWithoutCache - $totalWithCache;

        echo "\nTotal time (cold):       " . self::formatTime($totalWithoutCache) . "\n";
        echo "Total time (cached):     " . self::formatTime($totalWithCache) . "\n";
        echo "Time saved:              " . self::formatTime($timeSaved) . "\n";
        echo "Efficiency gain:         " . number_format(($timeSaved / $totalWithoutCache) * 100, 1) . "%\n";

        echo "\n✅ Benchmarks complete!\n\n";
    }

    /**
     * Reset results (useful for testing)
     */
    public static function reset(): void
    {
        self::$results = [];
    }

    /**
     * Get all results
     */
    public static function getResults(): array
    {
        return self::$results;
    }
}
