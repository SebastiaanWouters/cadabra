# Cadabra Server Deployment Guide

This guide covers deploying the Cadabra cache server on VPS, Docker, or Docker Compose.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start with Docker Compose](#quick-start-with-docker-compose)
- [Docker Deployment](#docker-deployment)
- [VPS Deployment (without Docker)](#vps-deployment-without-docker)
- [Environment Variables](#environment-variables)
- [API Endpoints](#api-endpoints)
- [Health Checks & Monitoring](#health-checks--monitoring)
- [Scaling & Performance](#scaling--performance)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

Choose one of the following:

- **Docker**: Docker 20.10+ and Docker Compose 2.0+ (recommended)
- **VPS/Bare Metal**: Bun 1.3+ installed

## Quick Start with Docker Compose

The fastest way to get Cadabra running:

```bash
# Navigate to cadabra package
cd packages/cadabra

# Copy environment template (optional)
cp .env.example .env

# Edit .env if needed (defaults work for most cases)
nano .env

# Start the server
bun run docker:up

# Verify it's running
curl http://localhost:6942/health

# View logs
bun run docker:logs

# Stop the server
bun run docker:down
```

The server will be available at `http://localhost:6942`.

---

## Docker Deployment

### Build the Image

```bash
cd packages/cadabra

# Build the image
bun run docker:build

# Or manually
docker build -t cadabra-server .
```

### Run the Container

```bash
# Run with default settings
bun run docker:run

# Or manually with custom port
docker run -d \
  --name cadabra \
  -p 6942:6942 \
  -e LOG_LEVEL=info \
  -e CORS_ENABLED=true \
  --restart unless-stopped \
  cadabra-server

# Check health
curl http://localhost:6942/health

# View logs
docker logs -f cadabra
```

### Deploy to VPS with Docker

```bash
# 1. SSH into your VPS
ssh user@your-vps.com

# 2. Install Docker (if not installed)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# 3. Clone your repository or copy files
git clone https://github.com/yourusername/cadali.git
cd cadali/packages/cadabra

# 4. Build and run
docker build -t cadabra-server .
docker run -d \
  --name cadabra \
  -p 6942:6942 \
  --restart unless-stopped \
  cadabra-server

# 5. Configure firewall (if needed)
sudo ufw allow 6942/tcp
```

---

## VPS Deployment (without Docker)

### Install Bun

```bash
curl -fsSL https://bun.sh/install | bash
```

### Deploy the Server

```bash
# 1. Clone repository
git clone https://github.com/yourusername/cadali.git
cd cadali/packages/cadabra

# 2. Install dependencies
bun install --production

# 3. Configure environment
cp .env.example .env
nano .env

# 4. Run the server
bun run start
```

### Run as Systemd Service

Create `/etc/systemd/system/cadabra.service`:

```ini
[Unit]
Description=Cadabra Cache Server
After=network.target

[Service]
Type=simple
User=cadabra
WorkingDirectory=/opt/cadabra
EnvironmentFile=/opt/cadabra/.env
ExecStart=/home/cadabra/.bun/bin/bun run server.ts
Restart=always
RestartSec=10

# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/cadabra

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
# Create user
sudo useradd -r -s /bin/false cadabra

# Copy files to /opt
sudo mkdir /opt/cadabra
sudo cp -r /path/to/packages/cadabra/* /opt/cadabra/
sudo chown -R cadabra:cadabra /opt/cadabra

# Install dependencies
cd /opt/cadabra
sudo -u cadabra bun install --production

# Enable service
sudo systemctl daemon-reload
sudo systemctl enable cadabra
sudo systemctl start cadabra

# Check status
sudo systemctl status cadabra

# View logs
sudo journalctl -u cadabra -f
```

---

## Environment Variables

Create a `.env` file or set environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | HTTP server port | `6942` |
| `HOST` | Bind address (0.0.0.0 for all interfaces) | `0.0.0.0` |
| `LOG_LEVEL` | Logging level: debug, info, warn, error | `info` |
| `CORS_ENABLED` | Enable CORS for cross-origin requests | `true` |

**Example `.env`:**

```bash
PORT=6942
HOST=0.0.0.0
LOG_LEVEL=info
CORS_ENABLED=true
```

---

## API Endpoints

### Health & Monitoring

- **GET /health** - Health check (returns 200 if healthy)
- **GET /metrics** - Prometheus-compatible metrics
- **GET /stats** - JSON cache statistics

### Cache Operations

- **POST /analyze** - Analyze SQL and generate cache key
  ```json
  {"sql": "SELECT * FROM users WHERE id = ?", "params": [10]}
  ```

- **POST /register** - Store query results
  ```json
  {
    "sql": "SELECT * FROM users WHERE id = ?",
    "params": [10],
    "result": "base64-encoded-serialized-data",
    "ttl": 3600
  }
  ```

- **GET /cache/:fingerprint** - Get cached results

- **POST /invalidate** - Invalidate cache entries
  ```json
  {"sql": "UPDATE users SET name = ? WHERE id = ?", "params": ["John", 10]}
  ```

- **POST /should-invalidate** - Check if query triggers invalidation

- **DELETE /table/:tableName** - Clear all cache for a table

### Example Requests

```bash
# Health check
curl http://localhost:6942/health

# Analyze query
curl -X POST http://localhost:6942/analyze \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT * FROM users WHERE id = 10"}'

# Get stats
curl http://localhost:6942/stats

# Get metrics (Prometheus format)
curl http://localhost:6942/metrics
```

---

## Health Checks & Monitoring

### Docker Health Check

Health checks are built into the Docker image:

```bash
# Check container health
docker inspect --format='{{.State.Health.Status}}' cadabra
```

### Prometheus Metrics

Scrape metrics from `/metrics` endpoint:

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'cadabra'
    static_configs:
      - targets: ['localhost:6942']
    metrics_path: '/metrics'
```

**Available metrics:**
- `cadabra_requests_total` - Total HTTP requests
- `cadabra_errors_total` - Total errors
- `cadabra_cache_hits_total` - Cache hits
- `cadabra_cache_misses_total` - Cache misses
- `cadabra_invalidations_total` - Cache invalidations
- `cadabra_cache_size` - Current cache size
- `cadabra_uptime_seconds` - Server uptime

### Logs

**Docker:**
```bash
docker logs -f cadabra
```

**Systemd:**
```bash
journalctl -u cadabra -f
```

Logs are in JSON format:
```json
{"timestamp":"2025-10-26T12:00:00.000Z","level":"info","message":"Request","data":{"method":"POST","path":"/analyze"}}
```

---

## Scaling & Performance

### Horizontal Scaling

Since Cadabra uses in-memory caching, each instance has its own cache. For horizontal scaling:

1. **Use a load balancer** (nginx, HAProxy, or cloud load balancer)
2. **Sticky sessions**: Route requests from the same client to the same instance
3. **Or accept cache misses**: Different instances may have different cache states

**Example nginx config:**
```nginx
upstream cadabra {
    ip_hash;  # Sticky sessions
    server cadabra1:6942;
    server cadabra2:6942;
    server cadabra3:6942;
}

server {
    listen 80;
    location / {
        proxy_pass http://cadabra;
    }
}
```

### Vertical Scaling

Adjust Docker resource limits:

```yaml
# docker-compose.yml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
    reservations:
      cpus: '0.5'
      memory: 256M
```

### Performance Tips

- **Set appropriate TTLs**: Balance freshness vs cache hit rate
- **Monitor cache hit rate**: Aim for 80%+ hit rate
- **Adjust log level**: Use `warn` or `error` in production for better performance
- **Use dedicated network**: Deploy Cadabra in the same network as your app servers

---

## Troubleshooting

### Server Won't Start

**Check logs:**
```bash
# Docker
docker logs cadabra

# Systemd
journalctl -u cadabra -n 50
```

**Common issues:**
- Port already in use: Change `PORT` in `.env`
- Permission denied: Ensure user has permissions (systemd deployments)
- Missing dependencies: Run `bun install --production`

### Health Check Failing

```bash
# Test health endpoint
curl -v http://localhost:6942/health

# Check if server is listening
netstat -tlnp | grep 6942

# Or
lsof -i :6942
```

### Cache Not Working

1. **Check cache stats:**
   ```bash
   curl http://localhost:8080/stats
   ```

2. **Enable debug logging:**
   ```bash
   # In .env
   LOG_LEVEL=debug

   # Restart server
   docker restart cadabra
   # or
   sudo systemctl restart cadabra
   ```

3. **Verify SQL queries are reaching server:**
   - Check PHP client configuration (`CADABRA_SERVICE_URL`)
   - Ensure network connectivity between app and Cadabra

### High Memory Usage

In-memory cache grows with cached data. Monitor with:

```bash
# Docker
docker stats cadabra

# System
ps aux | grep bun
```

**Solutions:**
- Reduce TTLs to expire data faster
- Implement cache size limits (custom modification)
- Add more memory to container/server

### Connection Timeout

- **Check firewall:** Ensure port 6942 is open
- **Network issues:** Verify network connectivity
- **Server overloaded:** Scale vertically or horizontally

---

## Production Checklist

- [ ] Environment variables configured
- [ ] Health checks enabled
- [ ] Monitoring/metrics collection set up
- [ ] Logs aggregated (if using multiple instances)
- [ ] Firewall rules configured
- [ ] SSL/TLS termination at load balancer (if exposing publicly)
- [ ] Backup/restore plan (not needed for in-memory cache)
- [ ] Auto-restart enabled (Docker `--restart` or systemd)
- [ ] Resource limits set appropriately
- [ ] Log rotation configured

---

## Getting Help

- **GitHub Issues**: Report bugs or request features
- **Logs**: Always include logs when reporting issues
- **Metrics**: Share `/stats` and `/metrics` output for performance issues

---

## License

MIT
