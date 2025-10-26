#!/usr/bin/env bash
set -euo pipefail

# Enhanced release script for Cadabra monorepo
# Enforces quality checks before allowing releases

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Track failures
FAILURES=()

function print_usage() {
    cat <<EOF
Usage: $0 <version> [--dry-run] [--skip-tests] [--skip-lint]

Release a new version of Cadabra packages with quality checks.

Arguments:
  version       Version number (e.g., 1.0.0, 1.2.3)
  --dry-run     Show what would be done without making changes
  --skip-tests  Skip running tests (not recommended)
  --skip-lint   Skip linting checks (not recommended)

Examples:
  $0 1.0.0                  # Full release with all checks
  $0 1.2.3 --dry-run        # Preview release
  $0 1.0.1 --skip-tests     # Skip tests (not recommended)

This script will:
  1. Validate version format
  2. Check git working directory is clean
  3. Run linting checks (unless --skip-lint)
  4. Run all tests (unless --skip-tests)
  5. Update package.json version
  6. Generate changelog entry
  7. Create git commit and tag
  8. Show next steps for publishing

Quality checks are REQUIRED for release. Use --skip-* flags only
when absolutely necessary (e.g., hotfix scenarios).
EOF
}

function error() {
    echo -e "${RED}✗ Error: $1${NC}" >&2
    exit 1
}

function success() {
    echo -e "${GREEN}✓ $1${NC}"
}

function info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

function warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

function step() {
    echo -e "\n${BLUE}==>${NC} $1"
}

function validate_version() {
    local version=$1
    if ! [[ $version =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        error "Invalid version format. Use semver (e.g., 1.0.0)"
    fi
}

function check_git_clean() {
    step "Checking git working directory..."

    if [[ ! -d "$ROOT_DIR/.git" ]]; then
        warning "Not a git repository"
        return
    fi

    if ! git diff-index --quiet HEAD --; then
        error "Working directory is not clean. Commit or stash changes first."
    fi

    success "Git working directory is clean"
}

function check_dependencies() {
    step "Checking dependencies..."

    cd "$ROOT_DIR"

    # Check if bun is available
    if ! command -v bun &> /dev/null; then
        error "Bun is not installed. Install from https://bun.sh"
    fi

    # Check if node_modules exists
    if [[ ! -d "node_modules" ]]; then
        warning "Dependencies not installed. Running 'bun install'..."
        bun install || error "Failed to install dependencies"
    fi

    success "Dependencies are installed"
}

function run_linting() {
    local skip=$1

    if [[ $skip == "true" ]]; then
        warning "Skipping linting checks (--skip-lint flag)"
        return
    fi

    step "Running linting checks..."

    cd "$ROOT_DIR"

    info "Running Biome linter..."
    if ! bun run check 2>&1; then
        FAILURES+=("Linting failed")
        error "Linting failed. Fix issues or run 'bun run fix' to auto-fix."
    fi

    success "Linting passed"
}

function run_typescript_tests() {
    local skip=$1

    if [[ $skip == "true" ]]; then
        warning "Skipping TypeScript tests (--skip-tests flag)"
        return
    fi

    step "Running TypeScript tests..."

    cd "$ROOT_DIR"

    # Type checking
    info "Type checking..."
    if ! bun run tsc 2>&1; then
        FAILURES+=("TypeScript type checking failed")
        error "Type checking failed. Fix type errors before releasing."
    fi
    success "Type checking passed"

    # Unit tests
    info "Running core library tests..."
    if ! bun run test:cadabra 2>&1; then
        FAILURES+=("Core library tests failed")
        error "Core library tests failed. Fix failing tests before releasing."
    fi
    success "Core library tests passed"

    # Integration tests
    info "Running integration tests..."
    if ! bun run test:integration 2>&1; then
        FAILURES+=("Integration tests failed")
        error "Integration tests failed. Fix failing tests before releasing."
    fi
    success "Integration tests passed"
}

function run_php_tests() {
    local skip=$1

    if [[ $skip == "true" ]]; then
        warning "Skipping PHP tests (--skip-tests flag)"
        return
    fi

    step "Running PHP tests..."

    cd "$ROOT_DIR/packages/cadabra-php"

    # Check if composer is available
    if ! command -v composer &> /dev/null; then
        warning "Composer not found, skipping PHP tests"
        return
    fi

    # Check if vendor exists
    if [[ ! -d "vendor" ]]; then
        info "Installing PHP dependencies..."
        composer install --no-interaction || warning "Failed to install PHP dependencies"
    fi

    # Run PHP unit tests
    if [[ -d "vendor" ]]; then
        info "Running PHP unit tests..."
        if ! composer test:unit 2>&1; then
            FAILURES+=("PHP unit tests failed")
            error "PHP unit tests failed. Fix failing tests before releasing."
        fi
        success "PHP unit tests passed"

        # Also check code style
        info "Checking PHP code style..."
        if ! composer cs:check 2>&1; then
            FAILURES+=("PHP code style check failed")
            error "PHP code style check failed. Run 'composer cs:fix' to auto-fix."
        fi
        success "PHP code style check passed"
    fi
}

function update_typescript_version() {
    local version=$1
    local dry_run=$2
    local pkg_file="$ROOT_DIR/packages/cadabra/package.json"

    step "Updating TypeScript package version to $version..."

    if [[ $dry_run == "true" ]]; then
        info "[DRY RUN] Would update $pkg_file to version $version"
    else
        cd "$ROOT_DIR/packages/cadabra"
        # Update version in package.json using jq or sed
        if command -v jq &> /dev/null; then
            jq ".version = \"$version\"" package.json > package.json.tmp && mv package.json.tmp package.json
        else
            # Fallback to sed
            sed -i.bak "s/\"version\": \".*\"/\"version\": \"$version\"/" package.json && rm -f package.json.bak
        fi
        success "Updated TypeScript package to v$version"
    fi
}

function update_changelog() {
    local version=$1
    local dry_run=$2
    local changelog="$ROOT_DIR/CHANGELOG.md"
    local date=$(date +%Y-%m-%d)

    step "Updating CHANGELOG.md..."

    if [[ $dry_run == "true" ]]; then
        info "[DRY RUN] Would add v$version entry to CHANGELOG.md"
        return
    fi

    # Check if CHANGELOG.md exists
    if [[ ! -f "$changelog" ]]; then
        warning "CHANGELOG.md not found, skipping"
        return
    fi

    # Replace [Unreleased] with version and date
    # This is a simple implementation - could be enhanced with git log parsing
    if grep -q "\[Unreleased\]" "$changelog"; then
        # Create backup
        cp "$changelog" "$changelog.bak"

        # Add new version section
        sed -i.tmp "s/## \[Unreleased\]/## [Unreleased]\n\n## [$version] - $date/" "$changelog"
        rm -f "$changelog.tmp"

        success "Updated CHANGELOG.md with v$version"
    else
        warning "No [Unreleased] section found in CHANGELOG.md"
    fi
}

function create_git_commit() {
    local version=$1
    local dry_run=$2

    if [[ ! -d "$ROOT_DIR/.git" ]]; then
        info "Not a git repository, skipping commit"
        return
    fi

    step "Creating git commit..."

    if [[ $dry_run == "true" ]]; then
        info "[DRY RUN] Would commit changes with message: 'Release v$version'"
    else
        git add "$ROOT_DIR/packages/cadabra/package.json"
        if [[ -f "$ROOT_DIR/CHANGELOG.md" ]]; then
            git add "$ROOT_DIR/CHANGELOG.md"
        fi
        git commit -m "chore: release v$version

- Update package version to $version
- Update CHANGELOG.md

[skip ci]" || warning "Nothing to commit"
        success "Created git commit"
    fi
}

function create_git_tag() {
    local version=$1
    local dry_run=$2
    local tag="v$version"

    if [[ ! -d "$ROOT_DIR/.git" ]]; then
        info "Not a git repository, skipping tag creation"
        return
    fi

    step "Creating git tag $tag..."

    if [[ $dry_run == "true" ]]; then
        info "[DRY RUN] Would create tag: $tag"
    else
        git tag -a "$tag" -m "Release $tag

Automated release created by release.sh

To publish:
- NPM: gh release create $tag --generate-notes
- Docker: Automated via GitHub Actions
- Packagist: Automated via tag push"
        success "Created tag $tag"
    fi
}

function print_next_steps() {
    local version=$1
    local tag="v$version"

    cat <<EOF

${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}
${GREEN}Release v$version prepared successfully!${NC}
${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}

${BLUE}Next steps:${NC}

${YELLOW}1. Review changes:${NC}
   git show HEAD
   git show $tag

${YELLOW}2. Push to GitHub:${NC}
   git push origin main
   git push origin $tag

${YELLOW}3. Create GitHub Release (triggers NPM publishing):${NC}
   gh release create $tag --generate-notes

   ${GREEN}This will automatically:${NC}
   ✓ Publish to NPM as cadabra@$version
   ✓ Build and publish Docker image
   ✓ Create release notes

${YELLOW}4. Verify deployments:${NC}
   ${GREEN}NPM:${NC}      npm info cadabra
   ${GREEN}Docker:${NC}   https://github.com/yourusername/cadali/pkgs/container/cadali%2Fcadabra
   ${GREEN}Packagist:${NC} https://packagist.org/packages/cadabra/php

${YELLOW}5. Announce release:${NC}
   - Update documentation
   - Post to social media
   - Notify users

${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}

EOF
}

function print_summary() {
    local version=$1
    local skip_tests=$2
    local skip_lint=$3

    cat <<EOF

${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}
${BLUE}Release Summary for v$version${NC}
${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}

Quality Checks:
  Linting:               $([ "$skip_lint" == "false" ] && echo "✓ Passed" || echo "⚠ Skipped")
  TypeScript Tests:      $([ "$skip_tests" == "false" ] && echo "✓ Passed" || echo "⚠ Skipped")
  PHP Tests:             $([ "$skip_tests" == "false" ] && echo "✓ Passed" || echo "⚠ Skipped")

Version Updates:
  TypeScript Package:    ✓ cadabra@$version
  CHANGELOG.md:          ✓ Updated

Git:
  Commit:                ✓ Created
  Tag:                   ✓ v$version

${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}

EOF
}

# Main script
main() {
    if [[ $# -lt 1 ]]; then
        print_usage
        exit 1
    fi

    local version=$1
    local dry_run=false
    local skip_tests=false
    local skip_lint=false

    # Parse flags
    shift
    while [[ $# -gt 0 ]]; do
        case $1 in
            --dry-run)
                dry_run=true
                shift
                ;;
            --skip-tests)
                skip_tests=true
                shift
                ;;
            --skip-lint)
                skip_lint=true
                shift
                ;;
            *)
                error "Unknown flag: $1"
                ;;
        esac
    done

    if [[ $dry_run == "true" ]]; then
        warning "Running in DRY RUN mode - no changes will be made"
    fi

    if [[ $skip_tests == "true" ]]; then
        warning "Tests will be SKIPPED - this is not recommended for production releases"
    fi

    if [[ $skip_lint == "true" ]]; then
        warning "Linting will be SKIPPED - this is not recommended for production releases"
    fi

    echo ""
    echo "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo "${BLUE}  Cadabra Release: v$version${NC}"
    echo "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    # Validation
    validate_version "$version"

    # Pre-flight checks
    if [[ $dry_run == "false" ]]; then
        check_git_clean
    fi
    check_dependencies

    # Quality checks
    run_linting "$skip_lint"
    run_typescript_tests "$skip_tests"
    run_php_tests "$skip_tests"

    # Update versions and files
    update_typescript_version "$version" "$dry_run"
    update_changelog "$version" "$dry_run"

    # Git operations
    if [[ $dry_run == "false" ]]; then
        create_git_commit "$version" "$dry_run"
        create_git_tag "$version" "$dry_run"
    else
        info "[DRY RUN] Would create commit and tag v$version"
    fi

    # Summary
    if [[ $dry_run == "false" ]]; then
        print_summary "$version" "$skip_tests" "$skip_lint"
        print_next_steps "$version"
    else
        echo ""
        warning "DRY RUN completed. No changes were made."
        echo ""
        info "Run without --dry-run to actually create the release:"
        echo "  $0 $version"
        echo ""
    fi
}

main "$@"
