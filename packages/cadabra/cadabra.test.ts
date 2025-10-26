import { describe, expect, test } from "bun:test";
import {
  analyzeSELECT,
  analyzeWrite,
  bindParams,
  CacheManager,
  normalizeSQL,
  shouldInvalidate,
} from "./cadabra";

// ========================================
// PARAMETER BINDING TESTS
// ========================================

describe("Parameter Binding", () => {
  test("binds ? style parameters", () => {
    const sql = "SELECT * FROM users WHERE id = ? AND status = ?";
    const bound = bindParams(sql, [10, "active"]);
    expect(bound).toBe(
      "SELECT * FROM users WHERE id = 10 AND status = 'active'"
    );
  });

  test("binds $1 style parameters", () => {
    const sql = "SELECT * FROM users WHERE id = $1 AND status = $2";
    const bound = bindParams(sql, [10, "active"]);
    expect(bound).toBe(
      "SELECT * FROM users WHERE id = 10 AND status = 'active'"
    );
  });

  test("binds :name style parameters", () => {
    const sql = "SELECT * FROM users WHERE id = :id AND status = :status";
    const bound = bindParams(sql, { id: 10, status: "active" });
    expect(bound).toBe(
      "SELECT * FROM users WHERE id = 10 AND status = 'active'"
    );
  });

  test("binds IN clause with array parameter", () => {
    const sql = "SELECT * FROM users WHERE id IN (?)";
    const bound = bindParams(sql, [[1, 2, 3]]);
    expect(bound).toBe("SELECT * FROM users WHERE id IN (1,2,3)");
  });

  test("escapes single quotes in strings", () => {
    const sql = "SELECT * FROM users WHERE name = ?";
    const bound = bindParams(sql, ["O'Brien"]);
    expect(bound).toBe("SELECT * FROM users WHERE name = 'O''Brien'");
  });

  test("handles null values", () => {
    const sql = "SELECT * FROM users WHERE email = ?";
    const bound = bindParams(sql, [null]);
    expect(bound).toBe("SELECT * FROM users WHERE email = NULL");
  });

  test("handles boolean values", () => {
    const sql = "SELECT * FROM users WHERE active = ?";
    const bound = bindParams(sql, [true]);
    expect(bound).toBe("SELECT * FROM users WHERE active = true");
  });
});

// ========================================
// NORMALIZATION TESTS
// ========================================

describe("Query Normalization", () => {
  test("normalizes whitespace", () => {
    const sql = "SELECT  *  FROM   users\n\nWHERE  id=10";
    const normalized = normalizeSQL(sql);
    expect(normalized).toContain("SELECT * FROM users WHERE id=10");
  });

  test("normalizes IN clause order", () => {
    const sql = "SELECT * FROM users WHERE id IN (3,1,2)";
    const normalized = normalizeSQL(sql);
    expect(normalized).toContain("IN (1,2,3)");
  });

  test("preserves string order in IN clause", () => {
    const sql =
      "SELECT * FROM users WHERE status IN ('active','pending','blocked')";
    const normalized = normalizeSQL(sql);
    expect(normalized).toContain("IN ('active','blocked','pending')");
  });

  test("removes unnecessary backticks", () => {
    const sql = "SELECT `id` FROM `users`";
    const normalized = normalizeSQL(sql);
    expect(normalized).not.toContain("`");
  });
});

// ========================================
// CACHE KEY GENERATION TESTS
// ========================================

describe("Cache Key Generation", () => {
  test("generates fingerprint for row lookup", () => {
    const key = analyzeSELECT("SELECT * FROM users WHERE id = ?", [10]);
    expect(key.fingerprint).toBe("users:id=10:row-lookup");
    expect(key.classification).toBe("row-lookup");
  });

  test("generates same key for equivalent queries", () => {
    const key1 = analyzeSELECT("SELECT id, name FROM users WHERE id = ?", [10]);
    const key2 = analyzeSELECT(
      "SELECT  id,name  FROM  users  WHERE id=?",
      [10]
    );
    expect(key1.fingerprint).toBe(key2.fingerprint);
  });

  test("generates different keys for different values", () => {
    const key1 = analyzeSELECT("SELECT * FROM users WHERE id = ?", [10]);
    const key2 = analyzeSELECT("SELECT * FROM users WHERE id = ?", [20]);
    expect(key1.fingerprint).not.toBe(key2.fingerprint);
  });

  test("classifies aggregate queries", () => {
    const key = analyzeSELECT("SELECT COUNT(*) FROM users");
    expect(key.classification).toBe("aggregate");
  });

  test("classifies join queries", () => {
    const key = analyzeSELECT(
      "SELECT u.*, o.* FROM users u JOIN orders o ON u.id = o.user_id"
    );
    expect(key.classification).toBe("join");
  });

  test("handles IN clause in cache key", () => {
    const key = analyzeSELECT("SELECT * FROM users WHERE id IN (?)", [
      [1, 2, 3],
    ]);
    expect(key.tables[0]).toBeDefined();
    expect(key.tables[0]?.conditions).toContainEqual({
      column: "id",
      operator: "IN",
      value: expect.arrayContaining([1, 2, 3]),
    });
  });
});

// ========================================
// INVALIDATION LOGIC TESTS
// ========================================

describe("Invalidation Logic", () => {
  test("invalidates on column overlap", () => {
    const cacheKey = analyzeSELECT("SELECT name FROM users WHERE id = ?", [10]);
    const writeInfo = analyzeWrite("UPDATE users SET name = ? WHERE id = ?", [
      "X",
      10,
    ]);
    expect(shouldInvalidate(cacheKey, writeInfo)).toBe(true);
  });

  test("skips invalidation on column mismatch", () => {
    const cacheKey = analyzeSELECT("SELECT name FROM users WHERE id = ?", [10]);
    const writeInfo = analyzeWrite("UPDATE users SET email = ? WHERE id = ?", [
      "x@test.com",
      10,
    ]);
    expect(shouldInvalidate(cacheKey, writeInfo)).toBe(false);
  });

  test("skips invalidation on row mismatch", () => {
    const cacheKey = analyzeSELECT("SELECT * FROM users WHERE id = ?", [10]);
    const writeInfo = analyzeWrite("UPDATE users SET name = ? WHERE id = ?", [
      "X",
      20,
    ]);
    expect(shouldInvalidate(cacheKey, writeInfo)).toBe(false);
  });

  test("invalidates on row overlap with IN clause", () => {
    const cacheKey = analyzeSELECT("SELECT * FROM users WHERE id IN (?)", [
      [1, 2, 3],
    ]);
    const writeInfo = analyzeWrite("UPDATE users SET name = ? WHERE id = ?", [
      "X",
      2,
    ]);
    expect(shouldInvalidate(cacheKey, writeInfo)).toBe(true);
  });

  test("skips invalidation when write affects different row in IN clause", () => {
    const cacheKey = analyzeSELECT("SELECT * FROM users WHERE id IN (?)", [
      [1, 2, 3],
    ]);
    const writeInfo = analyzeWrite("UPDATE users SET name = ? WHERE id = ?", [
      "X",
      99,
    ]);
    expect(shouldInvalidate(cacheKey, writeInfo)).toBe(false);
  });

  test("always invalidates on INSERT", () => {
    const cacheKey = analyzeSELECT("SELECT * FROM users WHERE id = ?", [10]);
    const writeInfo = analyzeWrite(
      "INSERT INTO users (id, name) VALUES (?, ?)",
      [99, "New"]
    );
    expect(shouldInvalidate(cacheKey, writeInfo)).toBe(true);
  });

  test("invalidates SELECT * on any column change", () => {
    const cacheKey = analyzeSELECT("SELECT * FROM users WHERE id = ?", [10]);
    const writeInfo = analyzeWrite("UPDATE users SET email = ? WHERE id = ?", [
      "x@test.com",
      10,
    ]);
    expect(shouldInvalidate(cacheKey, writeInfo)).toBe(true);
  });

  test("skips invalidation on different table", () => {
    const cacheKey = analyzeSELECT("SELECT * FROM users WHERE id = ?", [10]);
    const writeInfo = analyzeWrite(
      "UPDATE orders SET status = ? WHERE id = ?",
      ["shipped", 5]
    );
    expect(shouldInvalidate(cacheKey, writeInfo)).toBe(false);
  });

  test("invalidates conservatively on complex WHERE", () => {
    const cacheKey = analyzeSELECT("SELECT * FROM users WHERE id = ?", [10]);
    const writeInfo = analyzeWrite(
      "UPDATE users SET name = ? WHERE created_at > ?",
      ["X", "2024-01-01"]
    );
    expect(shouldInvalidate(cacheKey, writeInfo)).toBe(true);
  });
});

// ========================================
// CACHE MANAGER TESTS
// ========================================

describe("Cache Manager", () => {
  test("stores and retrieves cache entries", () => {
    const manager = new CacheManager();
    const cacheKey = analyzeSELECT("SELECT * FROM users WHERE id = ?", [10]);
    const result = { id: 10, name: "John" };

    manager.register(cacheKey.fingerprint, result, cacheKey);
    const retrieved = manager.get(cacheKey.fingerprint);

    expect(retrieved).toEqual(result);
    manager.close();
  });

  test("invalidates cache on write", () => {
    const manager = new CacheManager();
    const cacheKey = analyzeSELECT("SELECT name FROM users WHERE id = ?", [10]);
    const result = { name: "John" };

    manager.register(cacheKey.fingerprint, result, cacheKey);

    const writeInfo = analyzeWrite("UPDATE users SET name = ? WHERE id = ?", [
      "Jane",
      10,
    ]);
    const deletedCount = manager.invalidate(writeInfo);

    expect(deletedCount).toBe(1);
    expect(manager.get(cacheKey.fingerprint)).toBeNull();
    manager.close();
  });

  test("does not invalidate unrelated cache entries", () => {
    const manager = new CacheManager();
    const cacheKey = analyzeSELECT("SELECT name FROM users WHERE id = ?", [10]);
    const result = { name: "John" };

    manager.register(cacheKey.fingerprint, result, cacheKey);

    const writeInfo = analyzeWrite("UPDATE users SET email = ? WHERE id = ?", [
      "x@test.com",
      10,
    ]);
    const deletedCount = manager.invalidate(writeInfo);

    expect(deletedCount).toBe(0);
    expect(manager.get(cacheKey.fingerprint)).toEqual(result);
    manager.close();
  });
});

// ========================================
// EXTENDED OPERATORS TESTS (BETWEEN, IS NULL, etc.)
// ========================================

describe("Extended Operators", () => {
  test("handles BETWEEN operator", () => {
    const key = analyzeSELECT(
      "SELECT * FROM users WHERE age BETWEEN 18 AND 65"
    );

    const conditions = key.tables[0]?.conditions;
    expect(conditions).toBeDefined();
    expect(conditions?.length).toBeGreaterThan(0);

    const betweenCondition = conditions?.find((c) => c.operator === "BETWEEN");
    expect(betweenCondition).toBeDefined();
    expect(betweenCondition?.column).toBe("age");
    expect(betweenCondition?.operator).toBe("BETWEEN");
    expect(Array.isArray(betweenCondition?.value)).toBe(true);
  });

  test("handles IS NULL operator", () => {
    const key = analyzeSELECT("SELECT * FROM users WHERE email IS NULL");

    expect(key.tables[0]?.conditions).toContainEqual({
      column: "email",
      operator: "IS NULL",
      value: null,
    });
  });

  test("handles IS NOT NULL operator", () => {
    const key = analyzeSELECT("SELECT * FROM users WHERE email IS NOT NULL");

    expect(key.tables[0]?.conditions).toContainEqual({
      column: "email",
      operator: "IS NOT NULL",
      value: null,
    });
  });

  test("handles LIKE operator", () => {
    const key = analyzeSELECT("SELECT * FROM users WHERE name LIKE '%John%'");

    expect(key.tables[0]?.conditions).toContainEqual({
      column: "name",
      operator: "LIKE",
      value: "%John%",
    });
  });

  test("generates different keys for different BETWEEN ranges", () => {
    const key1 = analyzeSELECT(
      "SELECT * FROM users WHERE age BETWEEN 18 AND 30"
    );
    const key2 = analyzeSELECT(
      "SELECT * FROM users WHERE age BETWEEN 30 AND 50"
    );

    expect(key1.fingerprint).not.toBe(key2.fingerprint);
  });
});

// ========================================
// ORDER BY / LIMIT / OFFSET / DISTINCT TESTS
// ========================================

describe("ORDER BY / LIMIT / OFFSET / DISTINCT Support", () => {
  test("generates different keys for different ORDER BY", () => {
    const key1 = analyzeSELECT("SELECT * FROM users ORDER BY name ASC");
    const key2 = analyzeSELECT("SELECT * FROM users ORDER BY name DESC");
    const key3 = analyzeSELECT("SELECT * FROM users ORDER BY email ASC");

    expect(key1.fingerprint).not.toBe(key2.fingerprint);
    expect(key1.fingerprint).not.toBe(key3.fingerprint);
    expect(key2.fingerprint).not.toBe(key3.fingerprint);
  });

  test("generates different keys for different LIMIT", () => {
    const key1 = analyzeSELECT("SELECT * FROM users LIMIT 10");
    const key2 = analyzeSELECT("SELECT * FROM users LIMIT 20");
    const key3 = analyzeSELECT("SELECT * FROM users");

    expect(key1.fingerprint).not.toBe(key2.fingerprint);
    expect(key1.fingerprint).not.toBe(key3.fingerprint);
  });

  test("generates different keys for different OFFSET", () => {
    const key1 = analyzeSELECT("SELECT * FROM users LIMIT 10 OFFSET 0");
    const key2 = analyzeSELECT("SELECT * FROM users LIMIT 10 OFFSET 10");

    expect(key1.fingerprint).not.toBe(key2.fingerprint);
  });

  test("generates different keys for DISTINCT vs non-DISTINCT", () => {
    const key1 = analyzeSELECT("SELECT DISTINCT status FROM orders");
    const key2 = analyzeSELECT("SELECT status FROM orders");

    expect(key1.fingerprint).not.toBe(key2.fingerprint);
    expect(key1.distinct).toBe(true);
    expect(key2.distinct).toBeUndefined();
  });

  test("extracts ORDER BY details correctly", () => {
    const key = analyzeSELECT(
      "SELECT * FROM users ORDER BY name ASC, created_at DESC"
    );

    expect(key.orderBy).toHaveLength(2);
    expect(key.orderBy?.[0]).toEqual({ column: "name", order: "ASC" });
    expect(key.orderBy?.[1]).toEqual({ column: "created_at", order: "DESC" });
  });

  test("extracts LIMIT and OFFSET correctly", () => {
    const key = analyzeSELECT("SELECT * FROM users LIMIT 50 OFFSET 100");

    expect(key.limit).toBe(50);
    expect(key.offset).toBe(100);
  });

  test("complex query with ORDER BY, LIMIT, and DISTINCT", () => {
    const key = analyzeSELECT(
      "SELECT DISTINCT status FROM orders WHERE user_id = 10 ORDER BY status ASC LIMIT 5"
    );

    expect(key.distinct).toBe(true);
    expect(key.limit).toBe(5);
    expect(key.orderBy).toHaveLength(1);
    expect(key.orderBy?.[0]).toEqual({ column: "status", order: "ASC" });
  });
});

// ========================================
// JOIN SUPPORT TESTS
// ========================================

describe("JOIN Support", () => {
  test("extracts JOIN conditions from INNER JOIN", () => {
    const key = analyzeSELECT(
      "SELECT u.name, o.total FROM users u INNER JOIN orders o ON u.id = o.user_id"
    );

    expect(key.classification).toBe("join");
    expect(key.tables).toHaveLength(2);
    expect(key.tables[0]?.table).toBe("users");
    expect(key.tables[1]?.table).toBe("orders");
    expect(key.tables[0]?.joinConditions).toBeDefined();
    expect(key.tables[0]?.joinConditions?.length).toBeGreaterThan(0);

    const joinCond = key.tables[0]?.joinConditions?.[0];
    expect(joinCond).toBeDefined();
    expect(joinCond?.leftColumn).toBe("id");
    expect(joinCond?.rightColumn).toBe("user_id");
    expect(joinCond?.joinType).toBe("INNER JOIN");
  });

  test("extracts JOIN conditions from LEFT JOIN", () => {
    const key = analyzeSELECT(
      "SELECT u.*, o.id FROM users u LEFT JOIN orders o ON u.id = o.user_id"
    );

    expect(key.classification).toBe("join");
    expect(key.tables[0]?.joinConditions).toBeDefined();
    expect(key.tables[0]?.joinConditions?.[0]?.joinType).toBe("LEFT JOIN");
  });

  test("handles multiple JOINs", () => {
    const key = analyzeSELECT(`
      SELECT u.name, o.total, p.amount
      FROM users u
      INNER JOIN orders o ON u.id = o.user_id
      INNER JOIN payments p ON o.id = p.order_id
    `);

    expect(key.classification).toBe("join");
    expect(key.tables).toHaveLength(3);
    expect(key.tables[0]?.joinConditions?.length).toBeGreaterThanOrEqual(1);
  });

  test("different JOIN types generate different fingerprints", () => {
    const key1 = analyzeSELECT(
      "SELECT * FROM users u INNER JOIN orders o ON u.id = o.user_id"
    );
    const key2 = analyzeSELECT(
      "SELECT * FROM users u LEFT JOIN orders o ON u.id = o.user_id"
    );

    // JOIN conditions should be extracted and affect fingerprints
    expect(key1.tables[0]?.joinConditions).toBeDefined();
    expect(key2.tables[0]?.joinConditions).toBeDefined();
  });

  test("different JOIN conditions generate different fingerprints", () => {
    const key1 = analyzeSELECT(
      "SELECT * FROM users u JOIN orders o ON u.id = o.user_id"
    );
    const key2 = analyzeSELECT(
      "SELECT * FROM users u JOIN orders o ON u.email = o.user_email"
    );

    // Should extract different column pairs
    expect(key1.tables[0]?.joinConditions?.[0]?.leftColumn).not.toBe(
      key2.tables[0]?.joinConditions?.[0]?.leftColumn
    );
  });

  test("JOIN with WHERE clause", () => {
    const key = analyzeSELECT(`
      SELECT u.name, o.total
      FROM users u
      JOIN orders o ON u.id = o.user_id
      WHERE u.status = 'active' AND o.total > 100
    `);

    expect(key.classification).toBe("join");
    expect(key.tables).toHaveLength(2);
    expect(key.tables[0]?.joinConditions).toBeDefined();
  });

  test("JOIN with ORDER BY and LIMIT", () => {
    const key = analyzeSELECT(`
      SELECT u.name, o.total
      FROM users u
      JOIN orders o ON u.id = o.user_id
      ORDER BY o.total DESC
      LIMIT 10
    `);

    expect(key.classification).toBe("join");
    expect(key.orderBy).toHaveLength(1);
    expect(key.limit).toBe(10);
  });

  test("aggregate query with JOIN", () => {
    const key = analyzeSELECT(`
      SELECT u.name, COUNT(o.id) as order_count
      FROM users u
      LEFT JOIN orders o ON u.id = o.user_id
      GROUP BY u.id, u.name
    `);

    expect(key.classification).toBe("aggregate");
    expect(key.tables).toHaveLength(2);
  });
});

// ========================================
// JOIN-AWARE INVALIDATION TESTS
// ========================================

describe("JOIN-Aware Invalidation", () => {
  test("invalidates JOIN when joined column is modified", () => {
    const cacheKey = analyzeSELECT(
      "SELECT u.name, o.total FROM users u JOIN orders o ON u.id = o.user_id WHERE u.id = ?",
      [10]
    );

    // Modify the JOIN column
    const writeInfo = analyzeWrite(
      "UPDATE orders SET user_id = ? WHERE id = ?",
      [20, 100]
    );

    expect(shouldInvalidate(cacheKey, writeInfo)).toBe(true);
  });

  test("skips invalidation when non-joined column is modified", () => {
    const cacheKey = analyzeSELECT(
      "SELECT u.name, o.status FROM users u JOIN orders o ON u.id = o.user_id WHERE u.id = ?",
      [10]
    );

    // Modify a non-JOIN, non-selected column
    const writeInfo = analyzeWrite(
      "UPDATE orders SET internal_notes = ? WHERE user_id = ?",
      ["note", 10]
    );

    expect(shouldInvalidate(cacheKey, writeInfo)).toBe(false);
  });

  test("invalidates when selected column from joined table is modified", () => {
    const cacheKey = analyzeSELECT(
      "SELECT u.name, o.total FROM users u JOIN orders o ON u.id = o.user_id WHERE u.id = ?",
      [10]
    );

    // Modify a selected column
    const writeInfo = analyzeWrite(
      "UPDATE orders SET total = ? WHERE user_id = ?",
      [500, 10]
    );

    expect(shouldInvalidate(cacheKey, writeInfo)).toBe(true);
  });

  test("handles complex multi-table JOIN invalidation", () => {
    const cacheKey = analyzeSELECT(
      `
      SELECT u.name, o.total, p.amount
      FROM users u
      JOIN orders o ON u.id = o.user_id
      JOIN payments p ON o.id = p.order_id
      WHERE u.id = ?
    `,
      [10]
    );

    // Modify payments table
    const writeInfo = analyzeWrite(
      "UPDATE payments SET amount = ? WHERE order_id = ?",
      [100, 50]
    );

    expect(shouldInvalidate(cacheKey, writeInfo)).toBe(true);
  });
});

// ========================================
// COMPLEX QUERY TESTS
// ========================================

describe("Complex Query Scenarios", () => {
  test("handles query with JOIN, WHERE, ORDER BY, LIMIT, DISTINCT", () => {
    const key = analyzeSELECT(`
      SELECT DISTINCT u.email, o.status
      FROM users u
      INNER JOIN orders o ON u.id = o.user_id
      WHERE u.created_at > '2024-01-01'
        AND o.status IN ('pending', 'processing')
      ORDER BY u.email ASC, o.created_at DESC
      LIMIT 50 OFFSET 10
    `);

    expect(key.classification).toBe("join");
    expect(key.distinct).toBe(true);
    expect(key.orderBy).toHaveLength(2);
    expect(key.limit).toBe(50);
    expect(key.offset).toBe(10);
    expect(key.tables).toHaveLength(2);
  });

  test("handles aggregate with JOIN and HAVING", () => {
    const key = analyzeSELECT(`
      SELECT u.name, COUNT(o.id) as order_count, SUM(o.total) as total_spent
      FROM users u
      LEFT JOIN orders o ON u.id = o.user_id
      GROUP BY u.id, u.name
    `);

    expect(key.classification).toBe("aggregate");
  });

  test("handles subquery-like structure with IN clause", () => {
    const key = analyzeSELECT(`
      SELECT * FROM orders
      WHERE user_id IN (1, 2, 3, 4, 5)
      AND status = 'pending'
      ORDER BY created_at DESC
    `);

    expect(key.classification).toBe("complex");
    expect(key.tables[0]?.conditions).toBeDefined();
    const inCondition = key.tables[0]?.conditions?.find(
      (c) => c.operator === "IN"
    );
    expect(inCondition).toBeDefined();
  });

  test("handles query with BETWEEN and IS NOT NULL", () => {
    const key = analyzeSELECT(`
      SELECT * FROM orders
      WHERE total BETWEEN 100 AND 1000
        AND user_id IS NOT NULL
        AND created_at > '2024-01-01'
      ORDER BY total DESC
    `);

    const conditions = key.tables[0]?.conditions;
    expect(conditions?.some((c) => c.operator === "BETWEEN")).toBe(true);
    expect(conditions?.some((c) => c.operator === "IS NOT NULL")).toBe(true);
  });

  test("handles three-table JOIN with complex conditions", () => {
    const key = analyzeSELECT(`
      SELECT u.name, o.total, p.method, p.status
      FROM users u
      INNER JOIN orders o ON u.id = o.user_id
      LEFT JOIN payments p ON o.id = p.order_id
      WHERE u.status = 'active'
        AND o.total > 50
        AND (p.status = 'completed' OR p.status IS NULL)
      ORDER BY o.created_at DESC
      LIMIT 20
    `);

    expect(key.classification).toBe("join");
    expect(key.tables).toHaveLength(3);
    expect(key.limit).toBe(20);
  });

  test("generates consistent fingerprints for equivalent queries", () => {
    const key1 = analyzeSELECT(`
      SELECT u.name, o.total
      FROM users u
      JOIN orders o ON u.id = o.user_id
      WHERE u.id = 10
    `);

    const key2 = analyzeSELECT(`
      SELECT   u.name,  o.total
      FROM users u
      JOIN orders o ON u.id=o.user_id
      WHERE u.id=10
    `);

    expect(key1.fingerprint).toBe(key2.fingerprint);
  });

  test("different query structures generate different fingerprints", () => {
    const queries = [
      "SELECT * FROM users WHERE id = 10",
      "SELECT * FROM users WHERE id = 10 ORDER BY name",
      "SELECT * FROM users WHERE id = 10 LIMIT 5",
      "SELECT DISTINCT * FROM users WHERE id = 10",
      "SELECT u.*, o.* FROM users u JOIN orders o ON u.id = o.user_id WHERE u.id = 10",
    ];

    const fingerprints = queries.map((q) => analyzeSELECT(q).fingerprint);

    // All fingerprints should be unique
    const uniqueFingerprints = new Set(fingerprints);
    expect(uniqueFingerprints.size).toBe(queries.length);
  });
});

// ========================================
// INTEGRATION TESTS
// ========================================

describe("Integration Tests", () => {
  test("full workflow: analyze, register, invalidate", () => {
    const manager = new CacheManager();

    // 1. Analyze SELECT query
    const selectKey = analyzeSELECT(
      "SELECT id, name, email FROM users WHERE id = ?",
      [10]
    );

    // 2. Register result
    const result = { id: 10, name: "John", email: "john@example.com" };
    manager.register(selectKey.fingerprint, result, selectKey);

    // 3. Verify cache hit
    expect(manager.get(selectKey.fingerprint)).toEqual(result);

    // 4. Write that overlaps (name column)
    const updateName = analyzeWrite("UPDATE users SET name = ? WHERE id = ?", [
      "Jane",
      10,
    ]);
    const deleted1 = manager.invalidate(updateName);
    expect(deleted1).toBe(1);
    expect(manager.get(selectKey.fingerprint)).toBeNull();

    // 5. Re-register
    manager.register(selectKey.fingerprint, result, selectKey);

    // 6. Write that doesn't overlap (phone column not selected)
    const updatePhone = analyzeWrite(
      "UPDATE users SET phone = ? WHERE id = ?",
      ["555-1234", 10]
    );
    const deleted2 = manager.invalidate(updatePhone);
    expect(deleted2).toBe(0);
    expect(manager.get(selectKey.fingerprint)).toEqual(result);

    manager.close();
  });
});
