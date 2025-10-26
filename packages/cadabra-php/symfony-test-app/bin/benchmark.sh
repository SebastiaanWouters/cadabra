#!/usr/bin/env bash

set -e

echo "========================================="
echo "  Cadabra Performance Benchmarks"
echo "========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if Cadabra server is running
echo -e "${BLUE}Checking Cadabra server...${NC}"
if curl -s -f -o /dev/null http://localhost:6942/health 2>/dev/null || \
   curl -s -f -o /dev/null http://cadabra-server:6942/health 2>/dev/null; then
    echo -e "${GREEN}✓ Cadabra server is running${NC}"
    CADABRA_RUNNING=true
else
    echo -e "${RED}✗ Cadabra server not accessible${NC}"
    echo -e "${YELLOW}  Benchmarks require Cadabra server to be running${NC}"
    echo -e "${YELLOW}  Start with: docker-compose up -d cadabra-server${NC}"
    echo ""
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
    CADABRA_RUNNING=false
fi

echo ""
echo -e "${BLUE}Running performance benchmarks...${NC}"
echo -e "${YELLOW}This may take several minutes...${NC}"
echo ""

# Run benchmark test suite
vendor/bin/phpunit --testsuite="Benchmark Tests" --verbose

echo ""
if [ $? -eq 0 ]; then
    echo -e "${GREEN}=========================================${NC}"
    echo -e "${GREEN}  Benchmarks completed!${NC}"
    echo -e "${GREEN}=========================================${NC}"
    echo ""
    echo "Performance Summary:"
    echo "  - Check output above for detailed metrics"
    echo "  - Look for average query times and cache hit ratios"

    if [ "$CADABRA_RUNNING" = true ]; then
        echo ""
        echo "Cadabra Server Stats:"
        echo "  - View at: http://localhost:6942/stats"
        echo "  - Metrics at: http://localhost:6942/metrics"
    fi
else
    echo -e "${RED}=========================================${NC}"
    echo -e "${RED}  Benchmarks failed or incomplete!${NC}"
    echo -e "${RED}=========================================${NC}"
    exit 1
fi
