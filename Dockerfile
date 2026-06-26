# --- builder ---
FROM node:20-alpine AS builder
WORKDIR /app

# Prisma's engine binaries are dynamically linked against OpenSSL — Alpine
# ships minimal so we install it explicitly. `libc6-compat` covers a few
# libc symbols some node-gyp deps look for.
RUN apk add --no-cache openssl libc6-compat

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN npx prisma generate
RUN npm run build

# --- runtime ---
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

# Same OpenSSL requirement at runtime — without this the engine fails to
# load with "Error loading shared library libssl.so.x".
RUN apk add --no-cache openssl libc6-compat

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/prisma ./prisma

EXPOSE 4000
# Apply any pending Prisma migrations before booting the API. Without
# this, a deploy whose code references a new table/column starts
# successfully but throws on the first request that touches the new
# schema (we hit this on the CMS deploy). `migrate deploy` is a no-op
# when there's nothing pending, so the steady-state cost is one cheap
# roundtrip per container start.
# One-shot recovery for the failed 20260626140000_unique_username_per_role
# migration: clear the failed marker so Prisma re-runs that migration
# (with its now-safe dedupe-first SQL) instead of refusing to deploy
# anything until the row is manually fixed. The `|| true` makes the
# resolve step a no-op once the failed marker is gone, so this stays
# safe to run on every container start.
CMD ["sh", "-c", "(npx prisma migrate resolve --rolled-back 20260626140000_unique_username_per_role || true) && npx prisma migrate deploy && node dist/main.js"]
