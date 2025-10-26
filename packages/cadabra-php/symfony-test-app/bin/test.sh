#!/usr/bin/env bash

set -e

echo "========================================="
echo "  Cadabra Integration Tests"
echo "========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Parse arguments
FILTER=""
TESTSUITE=""
VERBOSE=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --filter)
            FILTER="--filter=$2"
            shift 2
            ;;
        --testsuite)
            TESTSUITE="--testsuite=$2"
            shift 2
            ;;
        --verbose|-v)
            VERBOSE="--verbose"
            shift
            ;;
        --help|-h)
            echo "Usage: ./bin/test.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --filter <pattern>       Run only tests matching pattern"
            echo "  --testsuite <name>       Run specific test suite (Integration Tests)"
            echo "  --verbose, -v            Verbose output"
            echo "  --help, -h               Show this help"
            echo ""
            echo "Examples:"
            echo "  ./bin/test.sh                                    # Run all tests"
            echo "  ./bin/test.sh --testsuite 'Integration Tests'   # Run only integration tests"
            echo "  ./bin/test.sh --filter testCacheHit              # Run tests matching filter"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Check if Cadabra server is accessible
echo -e "${BLUE}Checking Cadabra server...${NC}"
if curl -s -f -o /dev/null http://localhost:6942/health 2>/dev/null || \
   curl -s -f -o /dev/null http://cadabra-server:6942/health 2>/dev/null; then
    echo -e "${GREEN}✓ Cadabra server is running${NC}"
else
    echo -e "${YELLOW}⚠ Warning: Cadabra server not accessible${NC}"
    echo -e "${YELLOW}  Tests will run but caching may not work${NC}"
    echo -e "${YELLOW}  Start server with: cd ../cadabra && bun server.ts${NC}"
fi

echo ""
echo -e "${BLUE}Running PHPUnit tests...${NC}"
echo ""

# Run PHPUnit with optional filters
vendor/bin/phpunit $FILTER $TESTSUITE $VERBOSE

echo ""
if [ $? -eq 0 ]; then
    echo -e "${GREEN}=========================================${NC}"
    echo -e "${GREEN}  All tests passed!${NC}"
    echo -e "${GREEN}=========================================${NC}"
else
    echo -e "${RED}=========================================${NC}"
    echo -e "${RED}  Some tests failed!${NC}"
    echo -e "${RED}=========================================${NC}"
    exit 1
fi
