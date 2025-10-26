# Publishing Guide

Complete guide for publishing Cadabra packages across NPM, Docker, and Packagist.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Publishing Workflows](#publishing-workflows)
  - [1. TypeScript Package (NPM)](#1-typescript-package-npm)
  - [2. Docker Container](#2-docker-container)
  - [3. PHP Package (Packagist)](#3-php-package-packagist)
- [Automated Publishing](#automated-publishing)
- [Versioning](#versioning)
- [Troubleshooting](#troubleshooting)

## Prerequisites

### Required Accounts & Tokens

1. **NPM Account**
   - Create account at [npmjs.com](https://www.npmjs.com)
   - Generate access token: `npm login` or from [NPM tokens page](https://www.npmjs.com/settings/tokens)
   - Add `NPM_TOKEN` to GitHub Secrets

2. **GitHub Container Registry**
   - Included with GitHub account
   - GitHub Actions will use `GITHUB_TOKEN` automatically
   - No additional setup required

3. **Packagist (PHP)**
   - Create account at [packagist.org](https://packagist.org)
   - Register repository: `https://github.com/yourusername/cadali`
   - Packagist auto-updates on new git tags

### Required Tools

```bash
# Install Bun (for TypeScript)
curl -fsSL https://bun.sh/install | bash

# Install Composer (for PHP)
curl -sS https://getcomposer.org/installer | php
mv composer.phar /usr/local/bin/composer

# Install GitHub CLI (optional, for easier releases)
brew install gh  # macOS
# or
sudo apt install gh  # Ubuntu/Debian
```

## Quick Start

### Using the Makefile (Recommended)

```bash
# Prepare a new release
make release VERSION=1.0.0

# Follow the printed instructions to:
# 1. Push changes and tag
# 2. Publish to NPM
# 3. Publish Docker image (automated)
# 4. Register on Packagist (one-time)
```

### Manual Release

```bash
# Run release script
./scripts/release.sh 1.0.0

# Or dry-run to preview
./scripts/release.sh 1.0.0 --dry-run
```

## Publishing Workflows

### 1. TypeScript Package (NPM)

#### Option A: Automated via GitHub Actions

1. Create and push a git tag:
   ```bash
   git tag -a v1.0.0 -m "Release v1.0.0"
   git push origin v1.0.0
   ```

2. GitHub Actions will automatically:
   - Run tests
   - Type check
   - Publish to NPM with provenance

#### Option B: Manual Publishing

```bash
cd packages/cadabra

# Login to NPM (one-time)
npm login

# Publish
npm publish --access public
```

#### Verify NPM Package

```bash
# Check package info
npm info cadabra

# Install and test
npm install cadabra
```

### 2. Docker Container

Docker images are **automatically published** to GitHub Container Registry when you push a tag.

#### Automated Publishing (Recommended)

```bash
# Create and push tag
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0

# GitHub Actions will:
# - Build multi-platform images (amd64, arm64)
# - Push to ghcr.io/sebastiaanwouters/cadabra/cadabra
# - Tag with version, major, minor, and latest
```

#### Manual Publishing

```bash
cd packages/cadabra

# Build image
docker build -t ghcr.io/sebastiaanwouters/cadabra/cadabra:1.0.0 .

# Login to GitHub Container Registry
echo $GITHUB_TOKEN | docker login ghcr.io -u yourusername --password-stdin

# Push image
docker push ghcr.io/sebastiaanwouters/cadabra/cadabra:1.0.0

# Tag as latest
docker tag ghcr.io/sebastiaanwouters/cadabra/cadabra:1.0.0 ghcr.io/sebastiaanwouters/cadabra/cadabra:latest
docker push ghcr.io/sebastiaanwouters/cadabra/cadabra:latest
```

#### Using Published Docker Image

```bash
# Pull image
docker pull ghcr.io/sebastiaanwouters/cadabra/cadabra:1.0.0

# Run container
docker run -p 6942:6942 ghcr.io/sebastiaanwouters/cadabra/cadabra:1.0.0

# Or use in docker-compose
services:
  cadabra:
    image: ghcr.io/sebastiaanwouters/cadabra/cadabra:1.0.0
    ports:
      - "6942:6942"
```

### 3. PHP Package (Packagist)

Packagist automatically updates when you push git tags - **no manual publishing needed!**

#### One-Time Setup

1. Go to [packagist.org](https://packagist.org)
2. Click "Submit Package"
3. Enter repository URL: `https://github.com/yourusername/cadali`
4. Enable auto-update webhook (recommended)

#### Publishing New Version

```bash
# Just push a tag - Packagist updates automatically!
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0

# Wait 2-5 minutes for Packagist to update
```

#### Verify PHP Package

```bash
# Search on Packagist
composer search cadabra/php

# Install in a project
composer require cadabra/php
```

## Automated Publishing

### GitHub Actions Workflows

Three workflows automate the publishing process:

#### 1. CI Workflow (`.github/workflows/ci.yml`)
- Runs on every push and PR
- Tests TypeScript and PHP code
- Runs linters
- Matrix testing for PHP 8.1-8.4 and Symfony 6-7

#### 2. Docker Workflow (`.github/workflows/docker.yml`)
- Triggers on git tags (`v*.*.*`)
- Builds multi-platform images
- Pushes to GitHub Container Registry
- Tags: version, major.minor, major, latest, sha

#### 3. NPM Publish Workflow (`.github/workflows/npm-publish.yml`)
- Triggers on GitHub releases
- Runs tests and type checks
- Publishes to NPM with provenance
- Can be manually triggered

### Setting Up GitHub Secrets

Add these secrets in **Settings → Secrets → Actions**:

```bash
NPM_TOKEN          # NPM access token (required for NPM publishing)
```

`GITHUB_TOKEN` is automatically provided by GitHub Actions.

## Versioning

### Semantic Versioning

Follow [semver](https://semver.org/):

- **Major** (1.0.0 → 2.0.0): Breaking changes
- **Minor** (1.0.0 → 1.1.0): New features, backwards compatible
- **Patch** (1.0.0 → 1.0.1): Bug fixes

### Version Synchronization

- **TypeScript package** (`packages/cadabra/package.json`): Version is managed in package.json
- **PHP package** (`packages/cadabra-php/composer.json`): No version field (uses git tags)
- **Docker images**: Tagged with git version tags

Use the release script to keep everything synchronized:

```bash
./scripts/release.sh 1.2.3
```

## Troubleshooting

### NPM Publishing Issues

**Error: "You must be logged in to publish packages"**
```bash
npm login
# Follow prompts
```

**Error: "You do not have permission to publish"**
- Check package name isn't taken: `npm info cadabra`
- Ensure `publishConfig.access` is set to `public` in package.json

**Error: "Version already published"**
```bash
# Bump version first
npm version patch  # or minor, major
```

### Docker Publishing Issues

**Error: "unauthorized: authentication required"**
```bash
# Login to GitHub Container Registry
echo $GITHUB_PAT | docker login ghcr.io -u yourusername --password-stdin
```

**Error: "denied: permission denied"**
- Enable "Package write" permission in GitHub token settings
- Ensure repository visibility matches package visibility

### PHP/Packagist Issues

**Package not updating on Packagist**
- Verify webhook is configured: Repository Settings → Webhooks
- Manually trigger update on Packagist package page
- Ensure git tag was pushed: `git push origin --tags`

**Error: "Could not find package"**
```bash
# Wait a few minutes after pushing tag
# Or manually update on Packagist:
# https://packagist.org/packages/cadabra/php
```

## Best Practices

### Pre-Release Checklist

- [ ] All tests passing locally
- [ ] Linters passing (`make lint`)
- [ ] Documentation updated
- [ ] CHANGELOG.md updated
- [ ] Version bumped appropriately

### Release Process

1. **Prepare release**
   ```bash
   make release VERSION=1.2.3
   ```

2. **Push changes**
   ```bash
   git push origin main
   git push origin v1.2.3
   ```

3. **Create GitHub Release**
   ```bash
   gh release create v1.2.3 --generate-notes
   ```

4. **Verify all platforms**
   - NPM: `npm info cadabra`
   - Docker: Check GitHub Packages
   - Packagist: Check package page

### Testing Before Release

```bash
# Test locally
bun test
cd packages/cadabra-php && composer test

# Test Docker build
make docker-build
make docker-run

# Test NPM package locally
cd packages/cadabra
npm pack
# Install the tarball in a test project
```

## Support

For issues or questions:
- GitHub Issues: https://github.com/yourusername/cadali/issues
- Documentation: https://github.com/yourusername/cadali

## Additional Resources

- [NPM Publishing Guide](https://docs.npmjs.com/packages-and-modules/contributing-packages-to-the-registry)
- [GitHub Container Registry Docs](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)
- [Packagist Documentation](https://packagist.org/about)
- [Semantic Versioning](https://semver.org/)
