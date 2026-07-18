#!/bin/bash
# Run the Supabase schema migration against a remote or local database.
# Usage:
#   ./scripts/migrate-db.sh              # reads .env for SUPABASE_URL + SERVICE_ROLE_KEY
#   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... ./scripts/migrate-db.sh

set -euo pipefail

if [ -f .env ]; then
  export $(grep -v '^\s*#' .env | grep -v '^\s*$' | xargs)
fi

SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-${SUPABASE_URL:-}}"
SUPABASE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-${SUPABASE_KEY:-}}"

if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_KEY" ]; then
  echo "Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required"
  echo "Set them in .env or pass as environment variables"
  exit 1
fi

SQL_FILE="src/supabase/schema.sql"

if [ ! -f "$SQL_FILE" ]; then
  echo "Error: $SQL_FILE not found"
  exit 1
fi

echo "Running migration: $SQL_FILE"
echo "Target: $SUPABASE_URL"

SQL=$(cat "$SQL_FILE")

RESPONSE=$(curl -s -X POST "${SUPABASE_URL}/rest/v1/rpc/" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"query\": $(echo "$SQL" | jq -Rs .)}" 2>/dev/null || true)

# Fallback: run via psql if available
if [ -z "$RESPONSE" ] || echo "$RESPONSE" | grep -q "error"; then
  if command -v psql &>/dev/null; then
    echo "Trying psql..."
    PGPASSWORD="$SUPABASE_KEY" psql -h "${SUPABASE_URL#https://}" -U "postgres" -d "postgres" -f "$SQL_FILE"
  else
    echo "Migration SQL saved to $SQL_FILE — apply it manually via Supabase SQL Editor."
  fi
else
  echo "Migration applied successfully."
fi
