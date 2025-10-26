#!/usr/bin/env bash

set -e

echo "========================================="
echo "  Cadabra Docker Test Suite"
echo "========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}Step 1: Building Docker images...${NC}"
docker compose build
echo -e "${GREEN}✓ Images built${NC}"

echo ""
echo -e "${BLUE}Step 2: Starting services...${NC}"
docker compose up -d
echo -e "${GREEN}✓ Services started${NC}"

echo ""
echo -e "${BLUE}Step 3: Waiting for Cadabra server to be ready...${NC}"
for i in {1..30}; do
    if [ "$(docker inspect -f '{{.State.Health.Status}}' cadabra-server 2>/dev/null)" = "healthy" ]; then
        echo -e "${GREEN}✓ Cadabra server is ready${NC}"
        break
    fi
    echo -n "."
    sleep 1
    if [ $i -eq 30 ]; then
        echo ""
        echo -e "${RED}✗ Cadabra server failed to start${NC}"
        docker compose logs cadabra-server
        exit 1
    fi
done

echo ""
echo -e "${BLUE}Step 4: Setting up test application...${NC}"
docker compose exec -T symfony-app bash -c "./bin/setup.sh"
echo -e "${GREEN}✓ Setup complete${NC}"

echo ""
echo -e "${BLUE}Step 5: Running integration tests...${NC}"
docker compose exec -T symfony-app bash -c "./bin/test.sh"

echo ""
echo -e "${BLUE}Step 6: Running benchmarks...${NC}"
docker compose exec -T symfony-app bash -c "./bin/benchmark.sh"

echo ""
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}  All Docker tests completed!${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
echo "View Cadabra stats: docker compose exec cadabra-server curl http://localhost:6942/stats"
echo "View logs: docker compose logs -f"
echo "Stop services: docker compose down"
echo ""
