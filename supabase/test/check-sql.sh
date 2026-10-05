#!/usr/bin/env bash
# Checks the repo's SQL against a scratch Postgres. Needs PG* env vars
# (PGHOST, PGPORT, PGUSER, PGPASSWORD) pointing at a server you can create
# and drop databases on. Used by .github/workflows/ci.yml.
set -euo pipefail
export PGOPTIONS="-c client_min_messages=warning"
cd "$(dirname "$0")/.."
psql_q() { psql -v ON_ERROR_STOP=1 -q "$@" >/dev/null; }

fresh_db() {
  psql_q -d postgres -c "drop database if exists $1" -c "create database $1"
  psql_q -d "$1" -f test/supabase-stub.sql
}

echo "setup.sql on a brand-new project, twice"
fresh_db sql_fresh
psql_q -d sql_fresh -f setup.sql
psql_q -d sql_fresh -f setup.sql

echo "every migration in order, then setup.sql on top"
fresh_db sql_migrations
for f in migrations/*.sql; do psql_q -d sql_migrations -f "$f"; done
psql_q -d sql_migrations -f setup.sql

echo "setup.sql on a partly migrated project (0001-0009)"
fresh_db sql_partial
for f in migrations/000*.sql; do psql_q -d sql_partial -f "$f"; done
psql_q -d sql_partial -f setup.sql

echo "bootstrap.sql creates the first administrator"
psql_q -d sql_fresh -c "insert into auth.users (email) values ('admin@example.edu')"
sed -e 's/REPLACE_WITH_ADMIN_EMAIL/admin@example.edu/' -e 's/REPLACE_WITH_ADMIN_NAME/Admin/' \
    -e 's/REPLACE_WITH_SCHOOL_NAME/Test School/' bootstrap.sql | psql_q -d sql_fresh
test "$(psql -tA -d sql_fresh -c "select role from public.profiles where email = 'admin@example.edu'")" = administrator

echo "SQL checks passed"
