# Changelog

All notable changes to Cadabra will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2025-10-26

### Added
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

## [0.1.0] - Initial Development

### Added
- Core SQL query analysis and cache key generation
- Cadabra HTTP server with REST API
- PHP client for Cadabra server
- Symfony bundle with Doctrine DBAL middleware
- Integration tests for both TypeScript and PHP
- Docker containerization
- Comprehensive documentation

[Unreleased]: https://github.com/yourusername/cadali/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/yourusername/cadali/releases/tag/v0.1.0
