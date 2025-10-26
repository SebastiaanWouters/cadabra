/**
 * Repository of complex SQL queries for benchmarking and testing
 */

export const queries = {
  // ========================================
  // SIMPLE QUERIES (baseline)
  // ========================================

  getUserById: {
    sql: "SELECT * FROM users WHERE id = ?",
    params: (userId: number) => [userId],
    description: "Simple row lookup by ID",
  },

  getProductById: {
    sql: "SELECT * FROM products WHERE id = ?",
    params: (productId: number) => [productId],
    description: "Single product lookup",
  },

  // ========================================
  // JOIN QUERIES
  // ========================================

  getUserOrders: {
    sql: `
      SELECT u.name, u.email, o.id as order_id, o.total, o.status, o.created_at
      FROM users u
      INNER JOIN orders o ON u.id = o.user_id
      WHERE u.id = ?
      ORDER BY o.created_at DESC
      LIMIT 20
    `,
    params: (userId: number) => [userId],
    description: "User's recent orders (2-table JOIN)",
  },

  getOrderDetails: {
    sql: `
      SELECT o.id, o.total, o.status, o.created_at,
             u.name as customer_name, u.email,
             oi.product_id, p.name as product_name, oi.quantity, oi.price
      FROM orders o
      INNER JOIN users u ON o.user_id = u.id
      INNER JOIN order_items oi ON o.id = oi.order_id
      INNER JOIN products p ON oi.product_id = p.id
      WHERE o.id = ?
    `,
    params: (orderId: number) => [orderId],
    description: "Complete order details (4-table JOIN)",
  },

  getProductsWithCategory: {
    sql: `
      SELECT p.id, p.name, p.price, p.stock,
             c.name as category_name
      FROM products p
      INNER JOIN categories c ON p.category_id = c.id
      WHERE c.id = ?
      ORDER BY p.name
      LIMIT 50
    `,
    params: (categoryId: number) => [categoryId],
    description: "Products by category with category info",
  },

  getProductsWithReviews: {
    sql: `
      SELECT p.id, p.name, p.price,
             COUNT(r.id) as review_count,
             AVG(r.rating) as avg_rating
      FROM products p
      LEFT JOIN reviews r ON p.id = r.product_id
      WHERE p.category_id = ?
      GROUP BY p.id, p.name, p.price
      HAVING review_count > 0
      ORDER BY avg_rating DESC, review_count DESC
      LIMIT 20
    `,
    params: (categoryId: number) => [categoryId],
    description: "Products with review statistics",
  },

  // ========================================
  // AGGREGATE QUERIES
  // ========================================

  getSalesByCategory: {
    sql: `
      SELECT c.name as category,
             COUNT(DISTINCT oi.id) as items_sold,
             SUM(oi.quantity) as total_quantity,
             SUM(oi.quantity * oi.price) as revenue
      FROM categories c
      LEFT JOIN products p ON c.id = p.category_id
      LEFT JOIN order_items oi ON p.id = oi.product_id
      WHERE oi.created_at BETWEEN ? AND ?
      GROUP BY c.id, c.name
      HAVING revenue IS NOT NULL
      ORDER BY revenue DESC
    `,
    params: (startDate: string, endDate: string) => [startDate, endDate],
    description: "Sales analytics by category (aggregates + JOIN)",
  },

  getTopCustomers: {
    sql: `
      SELECT u.id, u.name, u.email,
             COUNT(o.id) as order_count,
             SUM(o.total) as total_spent,
             AVG(o.total) as avg_order_value
      FROM users u
      INNER JOIN orders o ON u.id = o.user_id
      WHERE o.status = 'delivered'
        AND o.created_at >= ?
      GROUP BY u.id, u.name, u.email
      HAVING total_spent > 1000
      ORDER BY total_spent DESC
      LIMIT 100
    `,
    params: (sinceDate: string) => [sinceDate],
    description: "Top customers by spend (aggregates + filters)",
  },

  getDailySales: {
    sql: `
      SELECT DATE(created_at) as date,
             COUNT(*) as order_count,
             SUM(total) as revenue,
             AVG(total) as avg_order_value
      FROM orders
      WHERE status IN ('delivered', 'shipped')
        AND created_at BETWEEN ? AND ?
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `,
    params: (startDate: string, endDate: string) => [startDate, endDate],
    description: "Daily sales metrics",
  },

  // ========================================
  // PAGINATION QUERIES
  // ========================================

  getProductsPaginated: {
    sql: `
      SELECT p.id, p.name, p.price, p.stock,
             c.name as category_name
      FROM products p
      INNER JOIN categories c ON p.category_id = c.id
      WHERE p.stock > 0
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `,
    params: (limit: number, offset: number) => [limit, offset],
    description: "Paginated product listing",
  },

  getOrdersPaginated: {
    sql: `
      SELECT o.id, o.total, o.status, o.created_at,
             u.name as customer_name
      FROM orders o
      INNER JOIN users u ON o.user_id = u.id
      WHERE o.status = ?
      ORDER BY o.created_at DESC
      LIMIT ? OFFSET ?
    `,
    params: (status: string, limit: number, offset: number) => [
      status,
      limit,
      offset,
    ],
    description: "Paginated order listing by status",
  },

  // ========================================
  // COMPLEX FILTER QUERIES
  // ========================================

  searchProducts: {
    sql: `
      SELECT DISTINCT p.id, p.name, p.price, p.stock,
             c.name as category_name
      FROM products p
      INNER JOIN categories c ON p.category_id = c.id
      WHERE p.name LIKE ?
        AND p.price BETWEEN ? AND ?
        AND p.stock > 0
      ORDER BY p.name
      LIMIT 50
    `,
    params: (searchTerm: string, minPrice: number, maxPrice: number) => [
      `%${searchTerm}%`,
      minPrice,
      maxPrice,
    ],
    description: "Product search with LIKE, BETWEEN, and filters",
  },

  getActiveCustomersWithOrders: {
    sql: `
      SELECT u.id, u.name, u.email, u.created_at,
             COUNT(o.id) as order_count
      FROM users u
      LEFT JOIN orders o ON u.id = o.user_id
      WHERE u.status = 'active'
        AND u.created_at BETWEEN ? AND ?
        AND o.id IS NOT NULL
      GROUP BY u.id, u.name, u.email, u.created_at
      HAVING order_count >= ?
      ORDER BY order_count DESC
      LIMIT 100
    `,
    params: (startDate: string, endDate: string, minOrders: number) => [
      startDate,
      endDate,
      minOrders,
    ],
    description: "Active customers with minimum orders (complex WHERE)",
  },

  getHighRatedProducts: {
    sql: `
      SELECT p.id, p.name, p.price,
             COUNT(r.id) as review_count,
             AVG(r.rating) as avg_rating
      FROM products p
      INNER JOIN reviews r ON p.id = r.product_id
      WHERE r.rating >= 4
        AND r.created_at > ?
        AND p.stock IS NOT NULL
      GROUP BY p.id, p.name, p.price
      HAVING review_count >= 5
      ORDER BY avg_rating DESC, review_count DESC
      LIMIT 50
    `,
    params: (sinceDate: string) => [sinceDate],
    description: "Top-rated products (IS NOT NULL, aggregates, HAVING)",
  },

  // ========================================
  // ANALYTICS QUERIES
  // ========================================

  getCategoryPerformance: {
    sql: `
      SELECT c.id, c.name,
             COUNT(DISTINCT p.id) as product_count,
             COUNT(DISTINCT o.id) as order_count,
             SUM(oi.quantity * oi.price) as total_revenue,
             AVG(r.rating) as avg_rating
      FROM categories c
      LEFT JOIN products p ON c.id = p.category_id
      LEFT JOIN order_items oi ON p.id = oi.product_id
      LEFT JOIN orders o ON oi.order_id = o.id
      LEFT JOIN reviews r ON p.id = r.product_id
      WHERE o.created_at BETWEEN ? AND ?
      GROUP BY c.id, c.name
      ORDER BY total_revenue DESC
    `,
    params: (startDate: string, endDate: string) => [startDate, endDate],
    description: "Category performance metrics (5-table JOIN)",
  },

  getRevenueTrends: {
    sql: `
      SELECT
        DATE(o.created_at) as date,
        o.status,
        COUNT(*) as order_count,
        SUM(o.total) as revenue,
        COUNT(DISTINCT o.user_id) as unique_customers
      FROM orders o
      WHERE o.created_at BETWEEN ? AND ?
      GROUP BY DATE(o.created_at), o.status
      ORDER BY date DESC, status
    `,
    params: (startDate: string, endDate: string) => [startDate, endDate],
    description: "Revenue trends by date and status",
  },

  // ========================================
  // WRITE QUERIES (for invalidation testing)
  // ========================================

  updateOrderStatus: {
    sql: "UPDATE orders SET status = ? WHERE id = ?",
    params: (status: string, orderId: number) => [status, orderId],
    description: "Update order status",
  },

  updateProductStock: {
    sql: "UPDATE products SET stock = stock - ? WHERE id = ?",
    params: (quantity: number, productId: number) => [quantity, productId],
    description: "Decrease product stock",
  },

  insertOrder: {
    sql: "INSERT INTO orders (user_id, total, status, created_at) VALUES (?, ?, ?, ?)",
    params: (userId: number, total: number, status: string, date: string) => [
      userId,
      total,
      status,
      date,
    ],
    description: "Insert new order",
  },

  insertReview: {
    sql: "INSERT INTO reviews (product_id, user_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?)",
    // biome-ignore lint/nursery/useMaxParams: Database insert requires 5 parameters
    params: (
      productId: number,
      userId: number,
      rating: number,
      comment: string,
      date: string
    ) => [productId, userId, rating, comment, date],
    description: "Insert product review",
  },

  updateUserStatus: {
    sql: "UPDATE users SET status = ? WHERE id = ?",
    params: (status: string, userId: number) => [status, userId],
    description: "Update user status",
  },
};

export type QueryName = keyof typeof queries;
