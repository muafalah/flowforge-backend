-- Create separate databases for integration and e2e tests
-- This script runs automatically when the PostgreSQL container is first initialized.

CREATE DATABASE flowforge_integration;
CREATE DATABASE flowforge_e2e;
