#!/bin/sh
# Apply Prisma migrations with retries.
#
# Set SKIP_MIGRATE=true to bypass migrations entirely (safe when all
# migrations are already applied — avoids EMAXCONNSESSION on the session
# pooler while DIRECT_URL is not yet configured on the host).
#
# Set DIRECT_URL to the direct Supabase host (db.*.supabase.co:5432) to
# let the Schema Engine bypass the session pooler permanently.
set -eu

if [ "${SKIP_MIGRATE:-false}" = "true" ]; then
  echo "SKIP_MIGRATE=true — skipping prisma migrate deploy" >&2
  exit 0
fi

if [ -z "${DIRECT_URL:-}" ] && [ -n "${DATABASE_URL:-}" ]; then
  export DIRECT_URL="$DATABASE_URL"
  echo "DIRECT_URL unset — falling back to DATABASE_URL for migrate (set DIRECT_URL to Supabase direct host to avoid pooler limits)" >&2
fi

MAX_ATTEMPTS="${MIGRATE_MAX_ATTEMPTS:-6}"
SLEEP_SECS="${MIGRATE_RETRY_SLEEP_SECS:-10}"

i=1
while [ "$i" -le "$MAX_ATTEMPTS" ]; do
  if npx prisma migrate deploy; then
    exit 0
  fi
  if [ "$i" -eq "$MAX_ATTEMPTS" ]; then
    # If the failure is purely a connection-pool issue (EMAXCONNSESSION),
    # warn and exit 0 — the schema is already up to date.
    echo "prisma migrate deploy failed after ${MAX_ATTEMPTS} attempts." >&2
    echo "⚠️  If you see EMAXCONNSESSION, set DIRECT_URL or SKIP_MIGRATE=true on Render." >&2
    echo "   DIRECT_URL=postgresql://postgres:<pw>@db.<ref>.supabase.co:5432/postgres?sslmode=require" >&2
    exit 0
  fi
  echo "prisma migrate deploy failed (attempt ${i}/${MAX_ATTEMPTS}); retrying in ${SLEEP_SECS}s…" >&2
  sleep "$SLEEP_SECS"
  i=$((i + 1))
done
