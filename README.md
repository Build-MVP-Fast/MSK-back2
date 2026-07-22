# MSK Platform — Backend

Unified backend that powers three frontends:

1. **`msk`** — React Native mobile app (guests, receptionists, admins, super-users)
2. **`msk-web`** — Next.js public website (booking, careers, about, etc.)
3. **`msk-admin`** *(future)* — Admin dashboard for property/booking management

One database, one API, three clients.

## Stack

| Layer | Tech |
|---|---|
| Framework | NestJS 10 (TypeScript) |
| ORM | Prisma 5 |
| Database | PostgreSQL 16 |
| Auth | JWT (access + refresh, rotated), Argon2 password/PIN hashing, OTP via email/SMS |
| Real-time | Socket.io (chat) |
| Storage | S3-compatible (Cloudflare R2 / MinIO / AWS S3) |
| Email | SMTP via Nodemailer |
| SMS | Twilio (pluggable) |
| Push | Expo / FCM (pluggable) |
| Payments | Stripe |
| Background jobs | BullMQ + Redis |
| API Docs | Swagger / OpenAPI at `/docs` |
| Validation | class-validator, class-transformer, Zod (where helpful) |

## Quick start

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env
# edit DATABASE_URL, JWT secrets, S3 creds, etc.

# 3. Boot infrastructure (Postgres + Redis + MinIO)
npm run docker:up

# 4. Generate Prisma client + run migrations
npm run prisma:generate
npm run prisma:migrate

# 5. (Optional) seed demo data
npm run prisma:seed

# 6. Start
npm run start:dev
```

API: `http://localhost:4000/api/v1`
Swagger UI: `http://localhost:4000/docs`
Health: `http://localhost:4000/health`

## Project structure

```
msk-backend/
├── prisma/
│   ├── schema.prisma          # single source of truth for all entities
│   └── seed.ts
├── src/
│   ├── main.ts                # bootstrap (helmet, CORS, validation, swagger)
│   ├── app.module.ts          # registers every domain module
│   ├── app.controller.ts      # /health
│   ├── common/
│   │   ├── prisma/            # PrismaService + module
│   │   ├── filters/           # AllExceptionsFilter
│   │   ├── interceptors/      # TransformInterceptor (uniform response shape)
│   │   ├── guards/            # JwtAuthGuard, RolesGuard
│   │   ├── decorators/        # @Public, @Roles, @CurrentUser
│   │   └── dto/               # PaginationDto
│   ├── config/                # configuration loader
│   └── modules/               # one folder per domain (see below)
├── package.json
├── tsconfig.json
├── nest-cli.json
├── Dockerfile
├── docker-compose.yml         # postgres + redis + minio + api
└── .env.example
```

## Module map

Each module is self-contained: `*.module.ts`, `*.controller.ts`, `*.service.ts`, optionally `dto/`.

### Identity & access
- **auth** — Multi-flavour login: web (email + password), app (phone + PIN), OTP, guest Google/Apple (`POST /auth/login/google`, `POST /auth/login/apple`), password/PIN reset, registration for guest/admin/web-guest, reservation enquiry. JWT + rotated refresh tokens.
- **users** — Profile management, additional guests, soft delete.
- **access-control** — RBAC (RoleDefinition + Permission + RolePermission), AccessGrant for resource-scoped permissions.

### Organization
- **companies** — Company CRUD.
- **departments** — Departments + nested children + member assignments.
- **wizards** — State-machine for guest/admin/receptionist onboarding.

### PMS (Property Management System)
- **properties** — Property CRUD with public/admin endpoints, publish/archive lifecycle.
- **rooms** — Rooms + room types (e.g. "Deluxe Suite") + amenity attachments.
- **amenities** — Global amenity catalog + property/room-type junctions.
- **photos** — Multipart upload, image processing (sharp → webp + thumb), S3 storage.
- **availability** — Per-day inventory model (`AvailabilityCalendarEntry`), date-range blocks, atomic `tryReserve` + `release` for concurrency-safe booking.
- **bookings** — Booking creation in a transaction with availability reservation, cancel/check-in/check-out lifecycle, public + admin endpoints.
- **payments** — Stripe payment intents + webhook handler, refunds.
- **invoices** — Invoice + line items, status lifecycle (DRAFT → ISSUED → PAID), guest-visible invoices.

### Operations
- **inventory** — Items, movements (IN/OUT/TRANSFER/ADJUSTMENT), allocations to rooms/users.
- **orders** — Purchase orders (supplier orders) with line items + status lifecycle.
- **tasks** — TaskItem + TaskAssignment, status & priority, department-scoped.
- **schedule** — Staff schedule entries (shifts).
- **requests** — Guest requests (housekeeping/maintenance/concierge/etc.) with assignment.

### Communication
- **chats** — Multi-flavour chats (DIRECT, GROUP, DEPARTMENT, SUPPLIER, STAFF_GUEST, CATEGORY) + ChatGateway (Socket.io).
- **notifications** — Push (Expo/FCM stub), email (Nodemailer), in-app, device token registration.

### Location & access
- **geofencing** — Geofence definitions + enter/exit/dwell events from mobile clients.
- **qr-codes** — QR generation (with image), resolve & scan logging.

### Content / feedback
- **reviews** — StaffReview, ObjectReview, PropertyReview (public on website), admin moderation + responses.
- **handbook** — Categories + items (per-property guest handbook).
- **rules** — Rule sections + items (per-property).

### Finance
- **finance** — Costs (staff/material/utility/etc.), revenue entries, financial reports (P&L, revenue by month, ADR, occupancy).

### Website-specific
- **careers** — Job postings + applications + CV upload (or "create CV" data flow).
- **inquiries** — Newsletter subscriptions, partner inquiries, contact form submissions.
- **public** — Cross-cutting public endpoints: search across properties (with availability filter, amenities, price range), featured listings, distinct cities.

### Future phases (schema is ready; modules to wire when scoped)
- **channels** (Phase 3) — `ChannelConnection` + `ChannelSyncLog` for Airbnb / Booking.com / Expedia integration.
- **dynamic-pricing** (Phase 4) — `DynamicPricingRule` rule engine for seasonality, occupancy, and competition-based price adjustments.

## Auth model

Two parallel flavours of credentials, both supported on the same `User`:

| Audience | Provider | Identity | Login flow |
|---|---|---|---|
| App: guest, admin, super-user, receptionist, staff, supplier | `PIN` | phone or email | phone/email + 4–6 digit PIN, optional OTP |
| Website: web-guest | `PASSWORD` | email | email + password (Argon2), email verify via OTP |

A user can have both. Each refresh token is hashed at rest, rotated on every refresh, and revocable individually.

## Response shape

All responses go through `TransformInterceptor`:

```json
{
  "success": true,
  "data": { /* payload */ },
  "meta": { /* pagination, etc. */ },
  "timestamp": "2026-05-01T12:00:00.000Z"
}
```

Errors via `AllExceptionsFilter`:

```json
{
  "success": false,
  "statusCode": 404,
  "timestamp": "...",
  "path": "/api/v1/properties/abc",
  "message": "Property not found"
}
```

## Common patterns

- Mark a route public with `@Public()` (skips JWT guard).
- Restrict to roles with `@Roles(UserRole.ADMIN, UserRole.SUPER_USER)` + `@UseGuards(JwtAuthGuard, RolesGuard)`.
- Inject the auth user with `@CurrentUser()` or `@CurrentUser('id')`.
- For multi-table writes, use `prisma.withTransaction(...)` (see `BookingsService.create` for the canonical example).

## Testing

```bash
npm run test            # unit
npm run test:e2e        # end-to-end (spins up Nest)
npm run test:cov        # coverage
```

## Deployment

`Dockerfile` is a two-stage build (builder → runtime). For Render/Railway:
1. Provision Postgres + Redis.
2. Set env vars from `.env.example`.
3. Build command: `npm install && npx prisma migrate deploy && npm run build`.
4. Start command: `node dist/main.js`.
5. Configure object storage (R2 recommended for cost).

## What's left

- [ ] Wire actual SMS/email transports (Twilio + SMTP) — currently stubbed in `OtpService`.
- [ ] Implement Expo/FCM push delivery in `PushService`.
- [ ] Add unit tests for `AvailabilityService.tryReserve` (concurrency edge cases).
- [ ] Channel manager integration (Phase 3).
- [ ] Dynamic pricing engine (Phase 4).
