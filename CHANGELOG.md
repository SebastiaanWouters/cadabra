# Changelog

All notable changes to Cadabra will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.1] - 2025-10-27

### Added
- Release version 0.3.1

## [0.3.0] - 2025-10-27

### Added
- Release version 0.3.0

## [Unreleased]

### Changed
- **BREAKING**: Extracted PHP package to separate repository
  - PHP client and Symfony bundle now maintained at [cadabra-php](https://github.com/SebastiaanWouters/cadabra-php)
  - Main repository now TypeScript-only (core library + HTTP server)
  - Removed Makefile in favor of Bun scripts (`bun run <command>`)
  - Simplified development workflow for TypeScript developers
  - PHP package continues to be available on Packagist as `cadabra/php`
- Updated all documentation to reflect new repository structure
- Simplified CI/CD workflows (removed PHP testing from main repo)
- Removed PHP runtime dependency (mise now only requires Bun)

### Removed
- PHP package (`packages/cadabra-php`) - moved to separate repository
- Makefile - replaced with Bun package.json scripts
- PHP-related CI/CD workflows from main repository

## [0.2.0] - 2025-10-26

### Added
- Release version 0.2.0

## [0.1.0] - 2025-10-26 (Initial Development)

### Added
- Core SQL query analysis and cache key generation
- Cadabra HTTP server with REST API
- PHP client for Cadabra server
- Symfony bundle with Doctrine DBAL middleware
- Integration tests for both TypeScript and PHP
- Docker containerization
- Comprehensive documentation
- Comprehensive publishing infrastructure
  - GitHub Actions workflows for CI/CD
  - Automated Docker image publishing to GitHub Container Registry
  - NPM package publishing workflow
  - Release automation scripts
- Complete publishing documentation (PUBLISHING.md)
- Makefile for simplified development commands
- License file (MIT)

### Fixed
- PHPUnit 10 deprecation warnings in Symfony test app
  - Removed deprecated `convertDeprecationsToExceptions` attribute
  - Updated `<coverage>` to `<source>` element
  - Removed deprecated `<listeners>` element
- Test environment configuration issues
- Cache directory permissions for tests

### Changed
- Improved package.json metadata for NPM publishing
- Enhanced composer.json metadata for Packagist
- SQLite in-memory database for tests (removed PostgreSQL dependency)

[Unreleased]: https://github.com/yourusername/cadali/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/yourusername/cadali/releases/tag/v0.1.0
