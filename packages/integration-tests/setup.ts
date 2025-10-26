import { Database } from "bun:sqlite";

// Configuration - adjust for faster/slower setup
const USERS = 10_000;
const CATEGORIES = 50;
const PRODUCTS = 5000;
const ORDERS = 50_000;
const AVG_ITEMS_PER_ORDER = 3;
const REVIEWS = 25_000;
const BATCH_SIZE = 1000;

const FIRST_NAMES = [
  "James",
  "Mary",
  "John",
  "Patricia",
  "Robert",
  "Jennifer",
  "Michael",
  "Linda",
  "William",
  "Barbara",
  "David",
  "Elizabeth",
  "Richard",
  "Susan",
  "Joseph",
  "Jessica",
  "Thomas",
  "Sarah",
  "Christopher",
  "Karen",
  "Charles",
  "Nancy",
  "Daniel",
  "Lisa",
];

const LAST_NAMES = [
  "Smith",
  "Johnson",
  "Williams",
  "Brown",
  "Jones",
  "Garcia",
  "Miller",
  "Davis",
  "Rodriguez",
  "Martinez",
  "Hernandez",
  "Lopez",
  "Gonzalez",
  "Wilson",
  "Anderson",
  "Thomas",
  "Taylor",
  "Moore",
  "Jackson",
  "Martin",
  "Lee",
  "Perez",
  "Thompson",
  "White",
];

const CATEGORY_NAMES = [
  "Electronics",
  "Computers",
  "Smartphones",
  "Tablets",
  "Cameras",
  "Home & Kitchen",
  "Furniture",
  "Appliances",
  "Bedding",
  "Cookware",
  "Clothing",
  "Men's Fashion",
  "Women's Fashion",
  "Kids' Clothing",
  "Shoes",
  "Sports",
  "Fitness Equipment",
  "Camping",
  "Cycling",
  "Team Sports",
  "Books",
  "Fiction",
  "Non-Fiction",
  "Educational",
  "Comics",
  "Toys & Games",
  "Action Figures",
  "Board Games",
  "Puzzles",
  "Dolls",
  "Beauty",
  "Skincare",
  "Makeup",
  "Haircare",
  "Fragrances",
  "Automotive",
  "Car Parts",
  "Motorcycle Parts",
  "Auto Tools",
  "Accessories",
  "Health",
  "Vitamins",
  "Medical Supplies",
  "Personal Care",
  "Wellness",
  "Garden",
  "Plants",
  "Garden Tools",
  "Outdoor Decor",
  "Lawn Care",
];

const PRODUCT_ADJECTIVES = [
  "Premium",
  "Deluxe",
  "Professional",
  "Advanced",
  "Ultimate",
  "Essential",
  "Classic",
  "Modern",
  "Vintage",
  "Eco-Friendly",
  "Portable",
  "Compact",
  "Heavy-Duty",
  "Lightweight",
  "Wireless",
];

const PRODUCT_NOUNS = [
  "Device",
  "Tool",
  "Set",
  "Kit",
  "System",
  "Collection",
  "Bundle",
  "Package",
  "Unit",
  "Gear",
  "Equipment",
  "Accessory",
  "Solution",
];

const ORDER_STATUSES = [
  "pending",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
];

const REVIEW_COMMENTS = [
  "Great product, exactly as described!",
  "Good quality for the price.",
  "Exceeded my expectations.",
  "Fast shipping, well packaged.",
  "Would definitely buy again.",
  "Not bad, but could be better.",
  "Disappointed with the quality.",
  "Excellent customer service.",
  "Perfect for my needs.",
  "Highly recommend!",
];

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function randomElement<T>(arr: T[]): T {
  const element = arr[randomInt(0, arr.length - 1)];
  if (element === undefined) {
    throw new Error("Array is empty");
  }
  return element;
}

function randomDate(start: Date, end: Date): string {
  const date = new Date(
    start.getTime() + Math.random() * (end.getTime() - start.getTime())
  );
  return date.toISOString().split("T")[0] ?? "";
}

function createSchema(db: Database): void {
  // Drop existing tables to ensure clean setup
  db.run("DROP TABLE IF EXISTS reviews");
  db.run("DROP TABLE IF EXISTS order_items");
  db.run("DROP TABLE IF EXISTS orders");
  db.run("DROP TABLE IF EXISTS products");
  db.run("DROP TABLE IF EXISTS categories");
  db.run("DROP TABLE IF EXISTS users");

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active'
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      total REAL NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      price REAL NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
      comment TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Create indexes for better query performance
  db.run("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)");
  db.run("CREATE INDEX IF NOT EXISTS idx_users_status ON users(status)");
  db.run(
    "CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id)"
  );
  db.run("CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)");
  db.run("CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at)");
  db.run(
    "CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id)"
  );
  db.run(
    "CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id)"
  );
  db.run(
    "CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id)"
  );
  db.run("CREATE INDEX IF NOT EXISTS idx_reviews_user ON reviews(user_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_reviews_rating ON reviews(rating)");
}

function generateUsers(db: Database): void {
  const stmt = db.prepare(
    "INSERT INTO users (name, email, created_at, status) VALUES (?, ?, ?, ?)"
  );

  const startDate = new Date("2020-01-01");
  const endDate = new Date();

  db.run("BEGIN TRANSACTION");

  for (let i = 1; i <= USERS; i++) {
    const firstName = randomElement(FIRST_NAMES);
    const lastName = randomElement(LAST_NAMES);
    const name = `${firstName} ${lastName}`;
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@example.com`;
    const createdAt = randomDate(startDate, endDate);
    const status = Math.random() > 0.1 ? "active" : "inactive";

    stmt.run(name, email, createdAt, status);

    if (i % BATCH_SIZE === 0) {
      db.run("COMMIT");
      db.run("BEGIN TRANSACTION");
    }
  }

  db.run("COMMIT");
}

function generateCategories(db: Database): void {
  const stmt = db.prepare(
    "INSERT INTO categories (name, description) VALUES (?, ?)"
  );

  db.run("BEGIN TRANSACTION");

  for (let i = 0; i < CATEGORIES; i++) {
    const name = CATEGORY_NAMES[i];
    if (!name) {
      continue;
    }
    const description = `${name} products and accessories`;
    stmt.run(name, description);
  }

  db.run("COMMIT");
}

function generateProducts(db: Database): void {
  const stmt = db.prepare(
    "INSERT INTO products (category_id, name, description, price, stock, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  );

  const startDate = new Date("2020-01-01");
  const endDate = new Date();

  db.run("BEGIN TRANSACTION");

  for (let i = 1; i <= PRODUCTS; i++) {
    const categoryId = randomInt(1, CATEGORIES);
    const adj = randomElement(PRODUCT_ADJECTIVES);
    const noun = randomElement(PRODUCT_NOUNS);
    const name = `${adj} ${noun} ${i}`;
    const description = `High-quality ${name.toLowerCase()} with advanced features`;
    const price = Number.parseFloat(randomFloat(9.99, 999.99).toFixed(2));
    const stock = randomInt(0, 1000);
    const createdAt = randomDate(startDate, endDate);

    stmt.run(categoryId, name, description, price, stock, createdAt);

    if (i % BATCH_SIZE === 0) {
      db.run("COMMIT");
      db.run("BEGIN TRANSACTION");
    }
  }

  db.run("COMMIT");
}

function generateOrders(db: Database): void {
  const orderStmt = db.prepare(
    "INSERT INTO orders (user_id, total, status, created_at) VALUES (?, ?, ?, ?)"
  );

  const itemStmt = db.prepare(
    "INSERT INTO order_items (order_id, product_id, quantity, price, created_at) VALUES (?, ?, ?, ?, ?)"
  );

  const startDate = new Date("2023-01-01");
  const endDate = new Date();

  db.run("BEGIN TRANSACTION");

  let _totalItems = 0;

  for (let i = 1; i <= ORDERS; i++) {
    const userId = randomInt(1, USERS);
    const status = randomElement(ORDER_STATUSES);
    const createdAt = randomDate(startDate, endDate);
    const itemCount = randomInt(1, AVG_ITEMS_PER_ORDER * 2);

    let orderTotal = 0;

    // Insert order
    const orderResult = orderStmt.run(userId, 0, status, createdAt);
    const orderId = Number(orderResult.lastInsertRowid);

    // Insert order items
    for (let j = 0; j < itemCount; j++) {
      const productId = randomInt(1, PRODUCTS);
      const quantity = randomInt(1, 5);
      const price = Number.parseFloat(randomFloat(9.99, 999.99).toFixed(2));
      orderTotal += price * quantity;

      itemStmt.run(orderId, productId, quantity, price, createdAt);
      _totalItems++;
    }

    // Update order total
    db.run("UPDATE orders SET total = ? WHERE id = ?", [
      Number.parseFloat(orderTotal.toFixed(2)),
      orderId,
    ]);

    if (i % BATCH_SIZE === 0) {
      db.run("COMMIT");
      db.run("BEGIN TRANSACTION");
    }
  }

  db.run("COMMIT");
}

function generateReviews(db: Database): void {
  const stmt = db.prepare(
    "INSERT INTO reviews (product_id, user_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?)"
  );

  const startDate = new Date("2023-01-01");
  const endDate = new Date();

  db.run("BEGIN TRANSACTION");

  for (let i = 1; i <= REVIEWS; i++) {
    const productId = randomInt(1, PRODUCTS);
    const userId = randomInt(1, USERS);
    const rating = randomInt(1, 5);
    const comment = randomElement(REVIEW_COMMENTS);
    const createdAt = randomDate(startDate, endDate);

    stmt.run(productId, userId, rating, comment, createdAt);

    if (i % BATCH_SIZE === 0) {
      db.run("COMMIT");
      db.run("BEGIN TRANSACTION");
    }
  }

  db.run("COMMIT");
}

function printStatistics(db: Database): void {
  const tables = [
    "users",
    "categories",
    "products",
    "orders",
    "order_items",
    "reviews",
  ];

  let _totalRecords = 0;

  for (const table of tables) {
    const result = db.query(`SELECT COUNT(*) as count FROM ${table}`).get() as {
      count: number;
    };
    const count = result.count;
    _totalRecords += count;
  }

  // Get file size
  const fs = require("node:fs");
  const stats = fs.statSync("ecommerce.db");
  const _sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
}

const db = new Database("ecommerce.db");
db.run("PRAGMA journal_mode = WAL");
db.run("PRAGMA synchronous = NORMAL");
db.run("PRAGMA cache_size = 10000");

createSchema(db);
generateUsers(db);
generateCategories(db);
generateProducts(db);
generateOrders(db);
generateReviews(db);

printStatistics(db);

db.close();
