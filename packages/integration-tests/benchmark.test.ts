import { Database } from "bun:sqlite";
import { beforeAll, describe, test } from "bun:test";
import { ECommerceApp } from "./app";

// Benchmark configuration
const WARMUP_RUNS = 5;
const BENCHMARK_RUNS = 50;

type BenchmarkResult = {
  scenario: string;
  withoutCache: number;
  withCache: number;
  speedup: number;
  cacheHitRate?: number;
};

const results: BenchmarkResult[] = [];

function formatTime(ms: number): string {
  if (ms < 1) {
    return `${(ms * 1000).toFixed(2)}µs`;
  }
  if (ms < 1000) {
    return `${ms.toFixed(2)}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatNumber(num: number): string {
  return num.toLocaleString();
}

function printBenchmarkHeader(scenario: string) {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`📊 ${scenario}`);
  console.log("=".repeat(70));
}

function printResults(result: BenchmarkResult) {
  console.log(`\nWithout Cache: ${formatTime(result.withoutCache)} total`);
  console.log(
    `   (${formatTime(result.withoutCache / BENCHMARK_RUNS)} per query)`
  );

  console.log(`\nWith Cache:    ${formatTime(result.withCache)} total`);
  console.log(
    `   (${formatTime(result.withCache / BENCHMARK_RUNS)} per query)`
  );

  console.log(`\n⚡ Speedup: ${result.speedup.toFixed(1)}x faster`);

  if (result.cacheHitRate !== undefined) {
    console.log(`✅ Cache Hit Rate: ${result.cacheHitRate.toFixed(1)}%`);
  }

  console.log("=".repeat(70));
}

async function benchmark(
  scenario: string,
  setupFn: (app: ECommerceApp) => void,
  queryFn: (app: ECommerceApp) => void
): Promise<BenchmarkResult> {
  printBenchmarkHeader(scenario);

  // Benchmark WITHOUT cache
  const uncachedApp = new ECommerceApp("ecommerce.db", false);
  setupFn(uncachedApp);

  console.log(`Running ${BENCHMARK_RUNS} iterations without cache...`);

  const uncachedStart = performance.now();
  for (let i = 0; i < BENCHMARK_RUNS; i++) {
    queryFn(uncachedApp);
  }
  const uncachedTime = performance.now() - uncachedStart;

  uncachedApp.close();

  // Benchmark WITH cache
  const cachedApp = new ECommerceApp("ecommerce.db", true);
  setupFn(cachedApp);

  console.log(`Warming up cache with ${WARMUP_RUNS} runs...`);

  // Warmup
  for (let i = 0; i < WARMUP_RUNS; i++) {
    queryFn(cachedApp);
  }

  console.log(`Running ${BENCHMARK_RUNS} iterations with cache...`);

  const cachedStart = performance.now();
  for (let i = 0; i < BENCHMARK_RUNS; i++) {
    queryFn(cachedApp);
  }
  const cachedTime = performance.now() - cachedStart;

  const cacheStats = cachedApp.getCacheStats();
  cachedApp.close();

  const result: BenchmarkResult = {
    scenario,
    withoutCache: uncachedTime,
    withCache: cachedTime,
    speedup: uncachedTime / cachedTime,
    cacheHitRate: cacheStats.hitRate,
  };

  printResults(result);
  results.push(result);

  return result;
}

beforeAll(() => {
  console.log("\n🚀 Starting Cadabra Performance Benchmarks\n");

  // Verify database exists
  try {
    const db = new Database("ecommerce.db");
    const result = db.query("SELECT COUNT(*) as count FROM users").get() as {
      count: number;
    };

    if (result.count === 0) {
      console.error("⚠️  Database is empty! Run 'bun run setup' first.");
      process.exit(1);
    }

    console.log(`✓ Database verified: ${formatNumber(result.count)} users\n`);
    db.close();
  } catch (_error) {
    console.error("⚠️  Database not found! Run 'bun run setup' first.");
    process.exit(1);
  }
});

describe("Performance Benchmarks", () => {
  test("Scenario 1: Simple row lookup (random IDs, cache misses)", async () => {
    await benchmark(
      "Simple Row Lookup - Random IDs (0% cache hits)",
      () => {},
      (app) => {
        app.getUserById(Math.floor(Math.random() * 10_000) + 1);
      }
    );
  });

  test("Scenario 1b: Simple row lookup (same ID, cache hits)", async () => {
    await benchmark(
      "Simple Row Lookup - Same ID (100% cache hits)",
      () => {},
      (app) => {
        app.getUserById(42); // Always query the same ID
      }
    );
  });

  test("Scenario 2: 2-table JOIN with ORDER BY (random IDs)", async () => {
    await benchmark(
      "User Orders - Random IDs (0% cache hits)",
      () => {},
      (app) => {
        app.getUserOrders(Math.floor(Math.random() * 10_000) + 1);
      }
    );
  });

  test("Scenario 2b: 2-table JOIN with ORDER BY (same ID, cache hits)", async () => {
    await benchmark(
      "User Orders - Same ID (100% cache hits)",
      () => {},
      (app) => {
        app.getUserOrders(100); // Always query the same user
      }
    );
  });

  test("Scenario 3: 4-table complex JOIN (random IDs)", async () => {
    await benchmark(
      "Order Details (4-table JOIN with product info)",
      () => {},
      (app) => {
        app.getOrderDetails(Math.floor(Math.random() * 50_000) + 1);
      }
    );
  });

  test("Scenario 4: Aggregate query with JOIN", async () => {
    await benchmark(
      "Products with Review Statistics (aggregate + JOIN)",
      () => {},
      (app) => {
        app.getProductsWithReviews(Math.floor(Math.random() * 50) + 1);
      }
    );
  });

  test(
    "Scenario 5: Sales analytics (complex aggregate)",
    async () => {
      await benchmark(
        "Sales by Category (multi-table aggregate)",
        () => {},
        (app) => {
          app.getSalesByCategory("2024-01-01", "2024-12-31");
        }
      );
    },
    { timeout: 30000 }
  );

  test("Scenario 6: Top customers (GROUP BY + HAVING)", async () => {
    await benchmark(
      "Top Customers by Spend (aggregate + filters)",
      () => {},
      (app) => {
        app.getTopCustomers("2023-01-01");
      }
    );
  });

  test("Scenario 7: Pagination queries", async () => {
    await benchmark(
      "Paginated Product List (ORDER BY + LIMIT + OFFSET)",
      () => {},
      (app) => {
        const offset = Math.floor(Math.random() * 100) * 10;
        app.getProductsPaginated(20, offset);
      }
    );
  });

  test("Scenario 8: Complex search with LIKE and BETWEEN", async () => {
    await benchmark(
      "Product Search (LIKE + BETWEEN + multiple filters)",
      () => {},
      (app) => {
        const terms = ["Premium", "Professional", "Ultimate", "Essential"];
        const term =
          terms[Math.floor(Math.random() * terms.length)] ?? "Premium";
        app.searchProducts(term, 50, 500);
      }
    );
  });

  test(
    "Scenario 9: Category performance (5-table JOIN)",
    async () => {
      await benchmark(
        "Category Performance Metrics (5-table JOIN + aggregates)",
        () => {},
        (app) => {
          app.getCategoryPerformance("2024-01-01", "2024-12-31");
        }
      );
    },
    { timeout: 60000 }
  );

  test("Scenario 10: Revenue trends (GROUP BY date and status)", async () => {
    await benchmark(
      "Revenue Trends by Date and Status (GROUP BY + multiple dimensions)",
      () => {},
      (app) => {
        app.getRevenueTrends("2024-01-01", "2024-12-31");
      }
    );
  });

  test("Scenario 11: High-rated products (complex WHERE + HAVING)", async () => {
    await benchmark(
      "High-Rated Products (IS NOT NULL + aggregate + HAVING)",
      () => {},
      (app) => {
        app.getHighRatedProducts("2023-01-01");
      }
    );
  });

  test("Scenario 12: Concurrent similar queries", async () => {
    printBenchmarkHeader("Concurrent Similar Queries (cache reuse)");

    const uncachedApp = new ECommerceApp("ecommerce.db", false);
    const cachedApp = new ECommerceApp("ecommerce.db", true);

    const queries = [
      () => uncachedApp.getUserOrders(1),
      () => uncachedApp.getUserOrders(2),
      () => uncachedApp.getUserOrders(3),
      () => uncachedApp.getOrderDetails(1),
      () => uncachedApp.getOrderDetails(2),
    ];

    const cachedQueries = [
      () => cachedApp.getUserOrders(1),
      () => cachedApp.getUserOrders(2),
      () => cachedApp.getUserOrders(3),
      () => cachedApp.getOrderDetails(1),
      () => cachedApp.getOrderDetails(2),
    ];

    console.log(`Running ${BENCHMARK_RUNS} iterations without cache...`);

    const uncachedStart = performance.now();
    for (let i = 0; i < BENCHMARK_RUNS; i++) {
      for (const q of queries) {
        q();
      }
    }
    const uncachedTime = performance.now() - uncachedStart;

    console.log(`Running ${BENCHMARK_RUNS} iterations with cache...`);

    const cachedStart = performance.now();
    for (let i = 0; i < BENCHMARK_RUNS; i++) {
      for (const q of cachedQueries) {
        q();
      }
    }
    const cachedTime = performance.now() - cachedStart;

    uncachedApp.close();
    cachedApp.close();

    const result: BenchmarkResult = {
      scenario: "Concurrent Similar Queries",
      withoutCache: uncachedTime,
      withCache: cachedTime,
      speedup: uncachedTime / cachedTime,
    };

    printResults(result);
    results.push(result);
  });

  test("Scenario 13: Batch invalidation performance", async () => {
    printBenchmarkHeader("Batch Invalidation Performance (100 entries)");

    const cachedApp = new ECommerceApp("ecommerce.db", true);

    // Register 100 different queries for the same table
    console.log("Registering 100 cache entries...");
    for (let i = 1; i <= 100; i++) {
      cachedApp.getUserById(i);
    }

    console.log("Warming up invalidation...");
    // Warmup: invalidate and re-cache
    for (let i = 0; i < WARMUP_RUNS; i++) {
      cachedApp.write("UPDATE users SET name = 'Test' WHERE id = 1", []);
      cachedApp.getUserById(1);
    }

    // Register 100 entries again
    for (let i = 1; i <= 100; i++) {
      cachedApp.getUserById(i);
    }

    console.log(`Running ${BENCHMARK_RUNS} batch invalidations...`);
    const start = performance.now();
    for (let i = 0; i < BENCHMARK_RUNS; i++) {
      // This should invalidate all cached user queries efficiently
      cachedApp.write("UPDATE users SET name = 'Batch Update'", []);

      // Re-cache for next iteration
      for (let j = 1; j <= 100; j++) {
        cachedApp.getUserById(j);
      }
    }
    const totalTime = performance.now() - start;

    const avgInvalidationTime = totalTime / BENCHMARK_RUNS;
    console.log(
      `\nAverage batch invalidation time: ${formatTime(avgInvalidationTime)}`
    );
    console.log(`Time per entry: ${formatTime(avgInvalidationTime / 100)}`);
    console.log(`Total time: ${formatTime(totalTime)}`);
    console.log("=".repeat(70));

    cachedApp.close();

    results.push({
      scenario: "Batch Invalidation (100 entries)",
      withoutCache: 0,
      withCache: avgInvalidationTime,
      speedup: 1,
    });
  });

  test("Scenario 14: Range-based invalidation precision", async () => {
    printBenchmarkHeader("Range-Based Invalidation Precision");

    const cachedApp = new ECommerceApp("ecommerce.db", true);

    // Cache queries for different age ranges
    console.log("Setting up cache with range-based queries...");

    // Query 1: Young users (age < 30)
    const youngUsersQuery =
      "SELECT COUNT(*) FROM users WHERE created_at < '2024-01-01'";
    cachedApp.query(youngUsersQuery);

    // Query 2: Old users (age >= 30)
    const oldUsersQuery =
      "SELECT COUNT(*) FROM users WHERE created_at >= '2024-01-01'";
    cachedApp.query(oldUsersQuery);

    const metricsBefore = cachedApp.getMetrics();
    console.log(`Cache entries before writes: ${metricsBefore.totalEntries}`);

    let skippedInvalidations = 0;
    let performedInvalidations = 0;

    console.log(`\nTesting ${BENCHMARK_RUNS} writes with range analysis...`);
    const start = performance.now();

    for (let i = 0; i < BENCHMARK_RUNS; i++) {
      // Write that affects ONLY young users (created_at < '2024-01-01')
      const metricsBeforeWrite = cachedApp.getMetrics();
      cachedApp.write(
        "UPDATE users SET name = 'Updated' WHERE created_at < '2023-01-01'",
        []
      );
      const metricsAfterWrite = cachedApp.getMetrics();

      // Check if old users query was invalidated (it shouldn't be)
      if (metricsBeforeWrite.totalEntries === metricsAfterWrite.totalEntries) {
        skippedInvalidations++;
      } else {
        performedInvalidations++;
      }

      // Re-cache for next iteration
      cachedApp.query(youngUsersQuery);
      cachedApp.query(oldUsersQuery);
    }

    const totalTime = performance.now() - start;

    console.log(`\nSkipped invalidations (correct): ${skippedInvalidations}`);
    console.log(`Performed invalidations: ${performedInvalidations}`);
    console.log(
      `Precision rate: ${((skippedInvalidations / BENCHMARK_RUNS) * 100).toFixed(1)}%`
    );
    console.log(
      `Average time per write: ${formatTime(totalTime / BENCHMARK_RUNS)}`
    );
    console.log("=".repeat(70));

    cachedApp.close();

    results.push({
      scenario: "Range-Based Invalidation Precision",
      withoutCache: 0,
      withCache: totalTime / BENCHMARK_RUNS,
      speedup: 1,
    });
  });

  test("Scenario 16: False invalidation rate comparison", async () => {
    printBenchmarkHeader("False Invalidation Rate (Precision Test)");

    const cachedApp = new ECommerceApp("ecommerce.db", true);

    // Set up cache with various queries
    console.log("Setting up diverse query cache...");

    const testQueries = [
      // Range-based queries
      { sql: "SELECT * FROM users WHERE id > 1000", params: [] },
      { sql: "SELECT * FROM users WHERE id <= 1000", params: [] },
      {
        sql: "SELECT * FROM products WHERE price BETWEEN 100 AND 500",
        params: [],
      },
      { sql: "SELECT * FROM products WHERE price < 100", params: [] },

      // Column-specific queries
      { sql: "SELECT name FROM users WHERE id = 500", params: [] },
      { sql: "SELECT email FROM users WHERE id = 500", params: [] },
      { sql: "SELECT created_at FROM users WHERE id = 500", params: [] },
    ];

    // Cache all queries
    for (const q of testQueries) {
      cachedApp.query(q.sql, q.params);
    }

    const initialEntries = cachedApp.getMetrics().totalEntries;
    console.log(`Initial cache entries: ${initialEntries}`);

    // Test writes that SHOULD NOT invalidate certain queries
    const testWrites = [
      // Write 1: Update high IDs (should NOT invalidate id <= 1000)
      { sql: "UPDATE users SET name = 'Test' WHERE id > 5000", shouldSkip: 1 },

      // Write 2: Update low prices (should NOT invalidate price BETWEEN 100 AND 500)
      {
        sql: "UPDATE products SET stock = 100 WHERE price < 50",
        shouldSkip: 1,
      },

      // Write 3: Update email (should NOT invalidate name-only or created_at-only queries)
      {
        sql: "UPDATE users SET email = 'test@example.com' WHERE id = 500",
        shouldSkip: 2,
      },
    ];

    let totalExpectedSkips = 0;
    let totalActualSkips = 0;

    console.log("\nTesting invalidation precision...");

    for (const write of testWrites) {
      // Re-cache queries
      for (const q of testQueries) {
        cachedApp.query(q.sql, q.params);
      }

      const entriesBefore = cachedApp.getMetrics().totalEntries;
      cachedApp.write(write.sql, []);
      const entriesAfter = cachedApp.getMetrics().totalEntries;

      const invalidated = entriesBefore - entriesAfter;
      const expectedToSkip = write.shouldSkip;
      const actuallySkipped = testQueries.length - invalidated;

      totalExpectedSkips += expectedToSkip;
      totalActualSkips += actuallySkipped;

      console.log(`\nWrite: ${write.sql.substring(0, 50)}...`);
      console.log(`  Expected to skip: ${expectedToSkip} queries`);
      console.log(`  Actually skipped: ${actuallySkipped} queries`);
      console.log(`  Invalidated: ${invalidated} queries`);
    }

    const precisionRate = (totalActualSkips / totalExpectedSkips) * 100;

    console.log(`\n${"=".repeat(70)}`);
    console.log(`Total expected skips: ${totalExpectedSkips}`);
    console.log(`Total actual skips: ${totalActualSkips}`);
    console.log(`Precision rate: ${precisionRate.toFixed(1)}%`);
    console.log(`${"=".repeat(70)}`);

    cachedApp.close();

    results.push({
      scenario: "False Invalidation Rate",
      withoutCache: 0,
      withCache: precisionRate,
      speedup: 1,
    });
  });

  test("Summary: Print all benchmark results", () => {
    console.log(`\n\n${"█".repeat(80)}`);
    console.log("                    BENCHMARK SUMMARY");
    console.log(`${"█".repeat(80)}\n`);

    console.log(`${"Scenario".padEnd(60)}Speedup`);
    console.log("-".repeat(80));

    for (const result of results) {
      const scenarioText = result.scenario.substring(0, 55);
      const speedupText = `${result.speedup.toFixed(1)}x`;
      console.log(scenarioText.padEnd(60) + speedupText.padStart(8));
    }

    console.log("-".repeat(80));

    const avgSpeedup =
      results.reduce((sum, r) => sum + r.speedup, 0) / results.length;
    console.log(
      "AVERAGE SPEEDUP".padEnd(60) + `${avgSpeedup.toFixed(1)}x`.padStart(8)
    );

    console.log(`\n${"█".repeat(80)}`);

    // Calculate total time saved
    const totalWithoutCache = results.reduce(
      (sum, r) => sum + r.withoutCache,
      0
    );
    const totalWithCache = results.reduce((sum, r) => sum + r.withCache, 0);
    const timeSaved = totalWithoutCache - totalWithCache;

    console.log(`\nTotal time without cache: ${formatTime(totalWithoutCache)}`);
    console.log(`Total time with cache:    ${formatTime(totalWithCache)}`);
    console.log(`Time saved:               ${formatTime(timeSaved)}`);
    console.log(
      `Efficiency gain:          ${((timeSaved / totalWithoutCache) * 100).toFixed(1)}%`
    );

    console.log("\n✅ Benchmarks complete!\n");
  });
});
