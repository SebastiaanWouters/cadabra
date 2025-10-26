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

  const _metrics = cachedApp.getMetrics();
  cachedApp.close();

  const result: BenchmarkResult = {
    scenario,
    withoutCache: uncachedTime,
    withCache: cachedTime,
    speedup: uncachedTime / cachedTime,
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
  test("Scenario 1: Simple row lookup (baseline)", async () => {
    await benchmark(
      "Simple Row Lookup (getUserById)",
      () => {},
      (app) => {
        app.getUserById(Math.floor(Math.random() * 10_000) + 1);
      }
    );
  });

  test("Scenario 2: 2-table JOIN with ORDER BY", async () => {
    await benchmark(
      "User Orders (2-table JOIN + ORDER BY + LIMIT)",
      () => {},
      (app) => {
        app.getUserOrders(Math.floor(Math.random() * 10_000) + 1);
      }
    );
  });

  test("Scenario 3: 4-table complex JOIN", async () => {
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
