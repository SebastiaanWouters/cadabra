import { Database } from "bun:sqlite";
import { analyzeSELECT, analyzeWrite, CacheManager } from "../cadabra";
import { queries } from "./queries";

export class ECommerceApp {
  private readonly _db: Database;
  private readonly _cache: CacheManager;
  private readonly useCache: boolean;
  private cacheHits = 0;
  private cacheMisses = 0;

  constructor(dbPath = "ecommerce.db", useCache = true) {
    this._db = new Database(dbPath);
    this._db.run("PRAGMA journal_mode = WAL");
    this._cache = new CacheManager();
    this.useCache = useCache;
  }

  /**
   * Execute a SELECT query with optional caching
   */
  query(sql: string, params?: unknown[]): unknown {
    if (!this.useCache) {
      // No caching - direct execution
      return this._db.query(sql).all(...((params || []) as never[]));
    }

    // Analyze query and generate cache key
    const cacheKey = analyzeSELECT(sql, params);

    // Check cache
    const cached = this._cache.get(cacheKey.fingerprint);
    if (cached !== null) {
      this.cacheHits++;
      return cached;
    }

    this.cacheMisses++;

    // Execute query
    const result = this._db.query(sql).all(...((params || []) as never[]));

    // Store in cache
    this._cache.register(cacheKey.fingerprint, result, cacheKey);

    return result;
  }

  /**
   * Execute a write query (INSERT/UPDATE/DELETE) with cache invalidation
   */
  write(sql: string, params?: unknown[]): void {
    // Execute the write
    this._db.query(sql).run(...((params || []) as never[]));

    if (!this.useCache) {
      return;
    }

    // Analyze and invalidate affected cache entries
    const writeInfo = analyzeWrite(sql, params);
    this._cache.invalidate(writeInfo);
  }

  /**
   * Get cache metrics
   */
  getMetrics() {
    return this._cache.getMetrics();
  }

  /**
   * Get cache hit/miss statistics
   */
  getCacheStats() {
    const total = this.cacheHits + this.cacheMisses;
    return {
      hits: this.cacheHits,
      misses: this.cacheMisses,
      total,
      hitRate: total > 0 ? (this.cacheHits / total) * 100 : 0,
    };
  }

  /**
   * Reset cache hit/miss statistics
   */
  resetCacheStats() {
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }

  /**
   * Get direct access to database (for testing)
   */
  get db(): Database {
    return this._db;
  }

  /**
   * Get direct access to cache manager (for testing)
   */
  get cache(): CacheManager {
    return this._cache;
  }

  /**
   * Close database connections
   */
  close(): void {
    this._db.close();
    this._cache.close();
  }

  // ========================================
  // API Methods
  // ========================================

  getUserById(userId: number) {
    const q = queries.getUserById;
    return this.query(q.sql, q.params(userId));
  }

  getUserOrders(userId: number) {
    const q = queries.getUserOrders;
    return this.query(q.sql, q.params(userId));
  }

  getOrderDetails(orderId: number) {
    const q = queries.getOrderDetails;
    return this.query(q.sql, q.params(orderId));
  }

  getProductsWithCategory(categoryId: number) {
    const q = queries.getProductsWithCategory;
    return this.query(q.sql, q.params(categoryId));
  }

  getProductsWithReviews(categoryId: number) {
    const q = queries.getProductsWithReviews;
    return this.query(q.sql, q.params(categoryId));
  }

  getSalesByCategory(startDate: string, endDate: string) {
    const q = queries.getSalesByCategory;
    return this.query(q.sql, q.params(startDate, endDate));
  }

  getTopCustomers(sinceDate: string) {
    const q = queries.getTopCustomers;
    return this.query(q.sql, q.params(sinceDate));
  }

  getDailySales(startDate: string, endDate: string) {
    const q = queries.getDailySales;
    return this.query(q.sql, q.params(startDate, endDate));
  }

  getProductsPaginated(limit: number, offset: number) {
    const q = queries.getProductsPaginated;
    return this.query(q.sql, q.params(limit, offset));
  }

  getOrdersPaginated(status: string, limit: number, offset: number) {
    const q = queries.getOrdersPaginated;
    return this.query(q.sql, q.params(status, limit, offset));
  }

  searchProducts(searchTerm: string, minPrice: number, maxPrice: number) {
    const q = queries.searchProducts;
    return this.query(q.sql, q.params(searchTerm, minPrice, maxPrice));
  }

  getActiveCustomersWithOrders(
    startDate: string,
    endDate: string,
    minOrders: number
  ) {
    const q = queries.getActiveCustomersWithOrders;
    return this.query(q.sql, q.params(startDate, endDate, minOrders));
  }

  getHighRatedProducts(sinceDate: string) {
    const q = queries.getHighRatedProducts;
    return this.query(q.sql, q.params(sinceDate));
  }

  getCategoryPerformance(startDate: string, endDate: string) {
    const q = queries.getCategoryPerformance;
    return this.query(q.sql, q.params(startDate, endDate));
  }

  getRevenueTrends(startDate: string, endDate: string) {
    const q = queries.getRevenueTrends;
    return this.query(q.sql, q.params(startDate, endDate));
  }

  // Write operations
  updateOrderStatus(status: string, orderId: number) {
    const q = queries.updateOrderStatus;
    this.write(q.sql, q.params(status, orderId));
  }

  updateProductStock(quantity: number, productId: number) {
    const q = queries.updateProductStock;
    this.write(q.sql, q.params(quantity, productId));
  }

  insertOrder(userId: number, total: number, status: string, date: string) {
    const q = queries.insertOrder;
    this.write(q.sql, q.params(userId, total, status, date));
  }

  insertReview(params: {
    productId: number;
    userId: number;
    rating: number;
    comment: string;
    date: string;
  }) {
    const q = queries.insertReview;
    this.write(
      q.sql,
      q.params(
        params.productId,
        params.userId,
        params.rating,
        params.comment,
        params.date
      )
    );
  }

  updateUserStatus(status: string, userId: number) {
    const q = queries.updateUserStatus;
    this.write(q.sql, q.params(status, userId));
  }
}
