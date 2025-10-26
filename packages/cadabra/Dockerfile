# Cadabra Server - Production Dockerfile
# Multi-stage build for minimal image size (~50MB)

# Stage 1: Build
FROM oven/bun:1.3-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lock* ./

# Install dependencies (production only)
RUN bun install --frozen-lockfile --production

# Copy source code
COPY . .

# Make server executable
RUN chmod +x server.ts

# Stage 2: Production runtime
FROM oven/bun:1.3-alpine

WORKDIR /app

# Copy only production files
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/*.ts ./

# Create non-root user for security
RUN addgroup -g 1001 -S cadabra && \
    adduser -S cadabra -u 1001 -G cadabra && \
    chown -R cadabra:cadabra /app

USER cadabra

# Expose port
EXPOSE 6942

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD bun --eval "await fetch('http://localhost:6942/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Run server
CMD ["bun", "run", "server.ts"]
