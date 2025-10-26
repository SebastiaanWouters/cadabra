#!/usr/bin/env bash

set -e

echo "========================================="
echo "  Cadabra Symfony Test App Setup"
echo "========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running in Docker
if [ -f /.dockerenv ]; then
    DOCKER_MODE=true
    echo -e "${BLUE}Running in Docker container${NC}"
else
    DOCKER_MODE=false
    echo -e "${BLUE}Running locally${NC}"
fi

echo ""
echo "Step 1: Installing dependencies..."
if [ "$DOCKER_MODE" = true ]; then
    composer install --no-interaction --prefer-dist
else
    composer install
fi
echo -e "${GREEN}✓ Dependencies installed${NC}"

echo ""
echo "Step 2: Creating database schema..."
php bin/console doctrine:schema:drop --force --full-database 2>/dev/null || true
php bin/console doctrine:schema:create
echo -e "${GREEN}✓ Database schema created${NC}"

echo ""
echo "Step 3: Loading fixtures..."
php bin/console doctrine:fixtures:load --no-interaction
echo -e "${GREEN}✓ Fixtures loaded${NC}"

echo ""
echo "Step 4: Clearing cache..."
php bin/console cache:clear
echo -e "${GREEN}✓ Cache cleared${NC}"

echo ""
echo "========================================="
echo -e "${GREEN}Setup completed successfully!${NC}"
echo "========================================="
echo ""
echo "Next steps:"
echo "  - Run tests: ./bin/test.sh"
echo "  - Run benchmarks: ./bin/benchmark.sh"
echo ""
