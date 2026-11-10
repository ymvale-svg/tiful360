#!/usr/bin/env bash
# Runs the SQL tests of the onboarding and system-access migrations against a throwaway
# Postgres: a minimal stand-in of the Supabase schema (00_stub_schema.sql), the migrations
# under test, then each test file. Every test file ends by printing "... all assertions passed";
# any failed assertion raises and stops the run.
#
#   PGHOST=/var/run/postgresql PGPORT=5432 PGUSER=postgres supabase/tests/sql/run.sh
#
# The database named by PGDATABASE (default: postgres) is wiped: use a scratch instance.
set -euo pipefail
cd "$(dirname "$0")/../../.."
PSQL=(psql -q -v ON_ERROR_STOP=1 -d "${PGDATABASE:-postgres}")
MIGRATIONS=(
  supabase/migrations/20261110090000_onboarding_checklist_integrity.sql
  supabase/migrations/20261110100000_onboarding_fulfillment_tracks.sql
  supabase/migrations/20261110110000_system_access_catalog.sql
  supabase/migrations/20261110120000_system_access_requests.sql
)
for test in supabase/tests/sql/*.sql; do
  [[ "$(basename "$test")" == 00_* ]] && continue
  "${PSQL[@]}" -f supabase/tests/sql/00_stub_schema.sql >/dev/null 2>&1
  for m in "${MIGRATIONS[@]}"; do "${PSQL[@]}" -f "$m" 2>&1 | grep -v NOTICE || true; done
  "${PSQL[@]}" -t -f "$test" | grep "all assertions passed"
done
