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
CMD ["node", "dist/main.js"]
