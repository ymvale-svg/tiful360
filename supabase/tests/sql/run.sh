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
  supabase/migrations/20261110200000_onboarding_checklist_integrity.sql
  supabase/migrations/20261110210000_onboarding_fulfillment_tracks.sql
  supabase/migrations/20261110220000_system_access_catalog.sql
  supabase/migrations/20261110230000_system_access_requests.sql
  supabase/migrations/20261110240000_system_access_revocation.sql
  supabase/migrations/20261110250000_vehicle_leasing.sql
  supabase/migrations/20261110260000_system_access_tree_scan.sql
  supabase/migrations/20261110300000_system_access_onboarding_link_and_legacy_import.sql
)
for test in supabase/tests/sql/*.sql; do
  [[ "$(basename "$test")" == 00_* ]] && continue
  "${PSQL[@]}" -f supabase/tests/sql/00_stub_schema.sql 2>&1 | grep -v -E "NOTICE|^$|drop cascades|DETAIL|and [0-9]+ other objects" || true
  "${PSQL[@]}" -tc "select 1" >/dev/null
  for m in "${MIGRATIONS[@]}"; do "${PSQL[@]}" -f "$m" 2>&1 | grep -v NOTICE || true; done
  "${PSQL[@]}" -t -f "$test" | grep "all assertions passed"
done
