#!/usr/bin/env bash
set -euo pipefail

REGISTRY_TEST_DATABASE_URL="${TEST_DATABASE_URL:-postgresql://harnesshub@127.0.0.1:54329/harnesshub?schema=harnesshub_test}"

if [[ "$REGISTRY_TEST_DATABASE_URL" != *"schema=harnesshub_test"* ]]; then
  printf '%s\n' "Integration tests require the isolated 'harnesshub_test' schema." >&2
  exit 2
fi

DATABASE_URL="$REGISTRY_TEST_DATABASE_URL" pnpm --filter @harnesshub/api db:migrate
TEST_DATABASE_URL="$REGISTRY_TEST_DATABASE_URL" pnpm --filter @harnesshub/api test:integration
