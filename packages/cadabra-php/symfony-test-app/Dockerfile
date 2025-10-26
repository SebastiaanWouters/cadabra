# Symfony Test App Dockerfile
# Multi-stage build for PHP application with SQLite

FROM php:8.2-cli-alpine AS base

# Install system dependencies and PHP extensions
RUN apk add --no-cache \
    bash \
    curl \
    git \
    sqlite \
    sqlite-dev \
    && docker-php-ext-install pdo_sqlite

# Install Composer
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

# ===== Builder Stage =====
FROM base AS builder

# Copy parent package (cadabra-php) to /cadabra-php first
COPY composer.json /cadabra-php/
COPY src/ /cadabra-php/src/

# Set working directory
WORKDIR /cadabra-php/symfony-test-app

# Copy symfony-test-app composer files first for better caching
COPY symfony-test-app/composer.json symfony-test-app/composer.lock* ./

# Install PHP dependencies (now ../ points to /cadabra-php)
RUN composer install --no-scripts --prefer-dist

# Copy symfony-test-app application code
COPY symfony-test-app/ .

# Run auto-scripts (allow failure)
RUN composer run-script auto-scripts || true

# ===== Runtime Stage =====
FROM base AS runtime

# Create non-root user
RUN addgroup -g 1001 symfony && \
    adduser -D -u 1001 -G symfony symfony

# Copy cadabra-php package from builder
COPY --from=builder --chown=symfony:symfony /cadabra-php /cadabra-php

# Set working directory
WORKDIR /cadabra-php/symfony-test-app

# Create directories with proper permissions
RUN mkdir -p var tests && \
    chown -R symfony:symfony var tests

# Switch to non-root user
USER symfony

# Set environment
ENV APP_ENV=test
ENV PATH="/cadabra-php/symfony-test-app/bin:${PATH}"

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD php bin/console --version || exit 1

# Default command
CMD ["php", "bin/console"]
