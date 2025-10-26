#!/usr/bin/env bun

/**
 * Cadabra CLI
 *
 * Global CLI entry point for running the Cadabra cache server.
 *
 * Usage:
 *   cadabra                # Start server with default settings
 *   PORT=8080 cadabra      # Start with custom port
 *   cadabra --help         # Show help
 *
 * Environment Variables:
 *   PORT              Server port (default: 6942)
 *   HOST              Server host (default: 0.0.0.0)
 *   LOG_LEVEL         Logging level: debug|info|warn|error (default: info)
 *   CORS_ENABLED      Enable CORS (default: true)
 */

import "../server.ts";
