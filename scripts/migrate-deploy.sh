#!/bin/sh
# Apply Prisma migrations with retries. Supabase session-mode poolers
# (pool_size ≈ 15) often refuse the Schema Engine with EMAXCONNSESSION
# when other clients are connected — a short backoff usually clears it.
# Prisma uses DIRECT_URL (schema.prisma directUrl). Fall back to
# DATABASE_URL so existing Render envs keep booting until DIRECT_URL
# is configured to the direct db.*.supabase.co host.
set -eu

if [ -z "${DIRECT_URL:-}" ] && [ -n "${DATABASE_URL:-}" ]; then
  export DIRECT_URL="$DATABASE_URL"
  echo "DIRECT_URL unset — falling back to DATABASE_URL for migrate (set DIRECT_URL to Supabase direct host to avoid pooler limits)" >&2
fi

MAX_ATTEMPTS="${MIGRATE_MAX_ATTEMPTS:-6}"
SLEEP_SECS="${MIGRATE_RETRY_SLEEP_SECS:-8}"

i=1
while [ "$i" -le "$MAX_ATTEMPTS" ]; do
  if npx prisma migrate deploy; then
    exit 0
  fi
  if [ "$i" -eq "$MAX_ATTEMPTS" ]; then
    echo "prisma migrate deploy failed after ${MAX_ATTEMPTS} attempts" >&2
    exit 1
  fi
  echo "prisma migrate deploy failed (attempt ${i}/${MAX_ATTEMPTS}); retrying in ${SLEEP_SECS}s…" >&2
  sleep "$SLEEP_SECS"
  i=$((i + 1))
done
