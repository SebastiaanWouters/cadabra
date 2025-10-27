#!/usr/bin/env bun

/**
 * Cadabra HTTP Server
 *
 * Production-ready cache server with REST API for SQL query caching
 * and automatic invalidation.
 */

import { analyzeSELECT, analyzeWrite, CacheManager } from "./index";

// ============================================
// CONFIGURATION
// ============================================

const PORT = Number.parseInt(process.env.PORT || "6942", 10);
const HOST = process.env.HOST || "0.0.0.0";
const LOG_LEVEL = process.env.LOG_LEVEL || "info";
const CORS_ENABLED = process.env.CORS_ENABLED !== "false";

// Cache manager instance
const cache = new CacheManager();

// Metrics
const metrics = {
  requests: 0,
  errors: 0,
  cacheHits: 0,
  cacheMisses: 0,
  invalidations: 0,
  startTime: Date.now(),
};

// ============================================
// LOGGING
// ============================================

type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function log(level: LogLevel, message: string, data?: unknown): void {
  if (LOG_LEVELS[level] >= LOG_LEVELS[LOG_LEVEL as LogLevel]) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...(data ? { data } : {}),
    };
    process.stdout.write(`${JSON.stringify(logEntry)}\n`);
  }
}

// ============================================
// HELPERS
// ============================================

function corsHeaders() {
  if (!CORS_ENABLED) {
    return {};
  }
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
  };
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
    },
  });
}

function errorResponse(message: string, status = 500): Response {
  metrics.errors++;
  return jsonResponse({ error: message }, status);
}

async function parseBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new Error("Invalid JSON body");
  }
}

// ============================================
// ROUTE HANDLERS
// ============================================

/**
 * POST /analyze
 * Analyze SQL query and generate cache key
 */
async function handleAnalyze(req: Request): Promise<Response> {
  const body = (await parseBody(req)) as {
    sql: string;
    params?: unknown[];
  };

  if (!body.sql) {
    return errorResponse("Missing 'sql' field", 400);
  }

  try {
    const analysis = analyzeSELECT(body.sql, body.params);

    return jsonResponse({
      fingerprint: analysis.fingerprint,
      classification: analysis.classification,
      tables: analysis.tables,
      normalized_sql: analysis.normalizedSQL,
    });
  } catch (error) {
    log("error", "Failed to analyze query", { error, sql: body.sql });
    return errorResponse(
      error instanceof Error ? error.message : "Analysis failed",
      400
    );
  }
}

/**
 * POST /register
 * Store query results in cache
 */
async function handleRegister(req: Request): Promise<Response> {
  const body = (await parseBody(req)) as {
    sql: string;
    params?: unknown[];
    result: string;
    ttl?: number;
  };

  if (!(body.sql && body.result)) {
    return errorResponse("Missing 'sql' or 'result' field", 400);
  }

  try {
    // Analyze query to get cache key
    const analysis = analyzeSELECT(body.sql, body.params);

    // Decode base64-encoded serialized result
    const resultData = Buffer.from(body.result, "base64").toString("utf-8");

    // Store in cache (we store the raw serialized data from PHP)
    cache.register(analysis.fingerprint, resultData, analysis);

    log("debug", "Registered cache entry", {
      fingerprint: analysis.fingerprint,
      classification: analysis.classification,
    });

    return jsonResponse({ success: true, fingerprint: analysis.fingerprint });
  } catch (error) {
    log("error", "Failed to register cache", { error, sql: body.sql });
    return errorResponse(
      error instanceof Error ? error.message : "Registration failed",
      400
    );
  }
}

/**
 * GET /cache/:fingerprint
 * Retrieve cached results
 */
function handleGetCache(_req: Request, fingerprint: string): Response {
  try {
    const result = cache.get(fingerprint);

    if (result === null) {
      metrics.cacheMisses++;
      return jsonResponse({ result: null }, 404);
    }

    metrics.cacheHits++;
    log("debug", "Cache hit", { fingerprint });

    // Return base64-encoded data (PHP client expects this format)
    // Result is stored as raw serialized PHP string, encode it back to base64
    const encoded = Buffer.from(result as string, "utf-8").toString("base64");
    return jsonResponse({ result: encoded });
  } catch (error) {
    log("error", "Failed to get cache", { error, fingerprint });
    return errorResponse(
      error instanceof Error ? error.message : "Get cache failed",
      500
    );
  }
}

/**
 * POST /invalidate
 * Invalidate cache entries based on write query
 */
async function handleInvalidate(req: Request): Promise<Response> {
  const body = (await parseBody(req)) as {
    sql: string;
    params?: unknown[];
  };

  if (!body.sql) {
    return errorResponse("Missing 'sql' field", 400);
  }

  try {
    const writeInfo = analyzeWrite(body.sql, body.params);
    cache.invalidate(writeInfo);
    metrics.invalidations++;

    log("debug", "Invalidated cache", {
      table: writeInfo.table,
      operation: writeInfo.operation,
    });

    return jsonResponse({ success: true, invalidated: writeInfo });
  } catch (error) {
    log("error", "Failed to invalidate cache", { error, sql: body.sql });
    return errorResponse(
      error instanceof Error ? error.message : "Invalidation failed",
      400
    );
  }
}

/**
 * POST /should-invalidate
 * Check if write query should trigger invalidation
 */
async function handleShouldInvalidate(req: Request): Promise<Response> {
  const body = (await parseBody(req)) as {
    sql: string;
    params?: unknown[];
  };

  if (!body.sql) {
    return errorResponse("Missing 'sql' field", 400);
  }

  try {
    // Analyze the write query to see if it's a valid write operation
    const writeInfo = analyzeWrite(body.sql, body.params);

    // If we got a valid write operation, it should invalidate
    const should =
      writeInfo.operation === "INSERT" ||
      writeInfo.operation === "UPDATE" ||
      writeInfo.operation === "DELETE";

    return jsonResponse({ should_invalidate: should });
  } catch (error) {
    log("error", "Failed to check should-invalidate", { error, sql: body.sql });
    // If it's not a write query, return false (should not invalidate)
    return jsonResponse({ should_invalidate: false });
  }
}

/**
 * GET /stats
 * Get cache statistics
 */
function handleStats(): Response {
  const cacheMetrics = cache.getMetrics();
  const uptime = Math.floor((Date.now() - metrics.startTime) / 1000);

  return jsonResponse({
    ...metrics,
    ...cacheMetrics,
    uptime_seconds: uptime,
  });
}

/**
 * DELETE /table/:tableName
 * Clear all cache entries for a table
 */
function handleClearTable(tableName: string): Response {
  try {
    cache.clearTable(tableName);
    log("info", "Cleared table cache", { table: tableName });
    return jsonResponse({ success: true, table: tableName });
  } catch (error) {
    log("error", "Failed to clear table", { error, table: tableName });
    return errorResponse(
      error instanceof Error ? error.message : "Clear table failed",
      500
    );
  }
}

/**
 * GET /health
 * Health check endpoint
 */
function handleHealth(): Response {
  const uptime = Math.floor((Date.now() - metrics.startTime) / 1000);
  return jsonResponse({
    status: "healthy",
    uptime_seconds: uptime,
    timestamp: new Date().toISOString(),
  });
}

/**
 * GET /metrics
 * Prometheus-compatible metrics
 */
function handleMetrics(): Response {
  const cacheMetrics = cache.getMetrics();
  const uptime = Math.floor((Date.now() - metrics.startTime) / 1000);

  const prometheusMetrics = `
# HELP cadabra_requests_total Total number of HTTP requests
# TYPE cadabra_requests_total counter
cadabra_requests_total ${metrics.requests}

# HELP cadabra_errors_total Total number of errors
# TYPE cadabra_errors_total counter
cadabra_errors_total ${metrics.errors}

# HELP cadabra_cache_hits_total Total number of cache hits
# TYPE cadabra_cache_hits_total counter
cadabra_cache_hits_total ${metrics.cacheHits}

# HELP cadabra_cache_misses_total Total number of cache misses
# TYPE cadabra_cache_misses_total counter
cadabra_cache_misses_total ${metrics.cacheMisses}

# HELP cadabra_invalidations_total Total number of cache invalidations
# TYPE cadabra_invalidations_total counter
cadabra_invalidations_total ${metrics.invalidations}

# HELP cadabra_cache_size Current number of cached entries
# TYPE cadabra_cache_size gauge
cadabra_cache_size ${cacheMetrics.totalEntries || 0}

# HELP cadabra_uptime_seconds Server uptime in seconds
# TYPE cadabra_uptime_seconds gauge
cadabra_uptime_seconds ${uptime}
`.trim();

  return new Response(prometheusMetrics, {
    headers: {
      "Content-Type": "text/plain; version=0.0.4",
      ...corsHeaders(),
    },
  });
}

// ============================================
// SERVER
// ============================================

const server = Bun.serve({
  port: PORT,
  hostname: HOST,
  development: false,

  async fetch(req) {
    metrics.requests++;
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    // Log request
    log("debug", "Request", { method, path });

    // CORS preflight
    if (method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    try {
      // Health check
      if (path === "/health" && method === "GET") {
        return handleHealth();
      }

      // Metrics
      if (path === "/metrics" && method === "GET") {
        return handleMetrics();
      }

      // POST /analyze
      if (path === "/analyze" && method === "POST") {
        return await handleAnalyze(req);
      }

      // POST /register
      if (path === "/register" && method === "POST") {
        return await handleRegister(req);
      }

      // GET /cache/:fingerprint
      if (path.startsWith("/cache/") && method === "GET") {
        const fingerprint = path.slice(7); // Remove "/cache/"
        return handleGetCache(req, fingerprint);
      }

      // POST /invalidate
      if (path === "/invalidate" && method === "POST") {
        return await handleInvalidate(req);
      }

      // POST /should-invalidate
      if (path === "/should-invalidate" && method === "POST") {
        return await handleShouldInvalidate(req);
      }

      // GET /stats
      if (path === "/stats" && method === "GET") {
        return handleStats();
      }

      // DELETE /table/:tableName
      if (path.startsWith("/table/") && method === "DELETE") {
        const tableName = path.slice(7); // Remove "/table/"
        return handleClearTable(tableName);
      }

      // 404 - Not found
      return errorResponse("Not found", 404);
    } catch (error) {
      log("error", "Unhandled error", { error, path, method });
      return errorResponse(
        error instanceof Error ? error.message : "Internal server error",
        500
      );
    }
  },

  error(error) {
    log("error", "Server error", { error });
    return errorResponse("Internal server error", 500);
  },
});

log("info", "Cadabra server started", {
  port: PORT,
  host: HOST,
  cors: CORS_ENABLED,
  logLevel: LOG_LEVEL,
});

// Graceful shutdown
process.on("SIGINT", () => {
  log("info", "Shutting down server...");
  server.stop();
  cache.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  log("info", "Shutting down server...");
  server.stop();
  cache.close();
  process.exit(0);
});
