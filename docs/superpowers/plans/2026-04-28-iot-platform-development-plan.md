# IoT Device Cloud Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deployable MVP for a small-to-medium IoT device cloud platform with invitation-based accounts, product and device management, MQTT/HTTP device access, device control, OTA, logs, and admin UI.

**Architecture:** Use a Next.js 16+ App Router application for the admin UI, BFF, business APIs, device HTTP APIs, and EMQX internal callbacks. Keep long-running and asynchronous work in a separate TypeScript worker that shares Prisma models and domain utilities with the web app. The default deployment target is a lightweight single server with 2 CPU cores, 4 GB RAM, and a 70 GB system disk.

**Tech Stack:** Next.js 16+ App Router, TypeScript, PostgreSQL, Prisma, Tailwind CSS, shadcn/ui, ECharts, Redis, BullMQ, EMQX, MinIO/S3, Docker Compose, Vitest, Playwright.

---

## 1. Scope And Assumptions

This plan implements the MVP defined in [docs/iot-platform-prd.md](/home/leo/work/open-git/ziot/docs/iot-platform-prd.md).

Assumptions:

- First release supports private deployment and organization isolation.
- First production target is one lightweight Docker Compose host with 2 CPU cores, 4 GB RAM, and 70 GB disk.
- The admin UI and API live in one Next.js app.
- The worker is a separate Node.js TypeScript process.
- Shared domain logic lives in packages and is imported by both app and worker.
- Device message payloads use JSON.
- MQTT device authentication starts with one-device-one-secret.
- OTA starts with full firmware package upgrade, SHA256 verification, and manual gray release.
- Video device access, visual dashboard, rule engine, SaaS billing, and large-scale time-series analytics stay outside the first MVP implementation.
- Prometheus, Grafana, ClickHouse, TimescaleDB, and video services are not part of the default lightweight deployment.

MVP success means:

- An invited user can register, log in, and manage resources in the assigned organization.
- An admin can create products and devices.
- A simulated MQTT device can authenticate, go online, report properties, receive a command, and return a command reply.
- A simulated HTTP device can authenticate, report data, pull commands, and return replies.
- A user can create firmware metadata, upload firmware through MinIO, create an OTA task, and track progress from a simulated device.
- Logs and audit records are queryable from the admin UI.
- The platform can be started locally with Docker Compose.
- Lightweight acceptance targets are 500 to 2,000 registered devices, 100 to 500 concurrent MQTT devices, and 5 to 20 inbound device messages per second.

## 2. Product Decisions Locked For Implementation

The following decisions are considered locked for MVP. Do not reopen them during implementation unless the PRD is changed first.

| Area | Decision |
| --- | --- |
| Deployment shape | Lightweight private deployment with Docker Compose is the default target |
| Application shape | Modular monolith in `apps/web`, background processing in `apps/worker` |
| Tenant model | Every tenant-owned resource includes `org_id`; cross-org access returns 403 |
| Device protocol | JSON over MQTT and HTTP only |
| MQTT authentication | One-device-one-secret with HMAC-SHA256 signature |
| HTTP authentication | Device headers with product key, device key, timestamp, nonce, and signature |
| Device identity storage | Store only `device_secret_hash`; show plain secret only once |
| Invitation storage | Store only `code_hash`; show plain invitation code only once |
| OTA | Full firmware package upgrade with SHA256 verification; no differential OTA in MVP |
| Telemetry history | Store latest shadow and short-term logs in PostgreSQL; no TimescaleDB or ClickHouse in MVP |
| Realtime UI | Implement SSE only in MVP; WebSocket is reserved for a later version |
| Admin UI style | Dense operations console, not a landing page or marketing layout |
| Device grouping | MVP supports same-product groups only; cross-product groups are reserved for viewing/filtering later |
| Batch control | MVP supports only same-product, same-service batch control |
| Batch import | Not in MVP runtime scope; reserve page and API design only |

MVP priority line:

| Priority | Include In MVP | Examples |
| --- | --- | --- |
| P0 | Required for Alpha | Identity, RBAC, products, devices, MQTT access, shadow, command lifecycle, basic logs |
| P1 | Required for Beta/MVP | HTTP device access, OTA, audit, dashboard summary, lightweight deployment, backup and restore |
| P2 | Design only | Rule engine, alert center, video devices, SaaS billing, long-term telemetry analytics |

Implementation must not add P2 runtime features before all P0 and P1 release gates are satisfied.

## 3. Repository Structure

Create this structure before feature work begins:

```text
ziot/
├── apps/
│   ├── web/
│   │   ├── app/
│   │   │   ├── (auth)/
│   │   │   ├── (console)/
│   │   │   ├── api/
│   │   │   │   ├── v1/
│   │   │   │   ├── device-api/v1/
│   │   │   │   └── internal/emqx/
│   │   │   └── layout.tsx
│   │   ├── components/
│   │   ├── features/
│   │   ├── lib/
│   │   ├── middleware.ts
│   │   ├── next.config.ts
│   │   ├── package.json
│   │   └── tailwind.config.ts
│   └── worker/
│       ├── src/
│       │   ├── index.ts
│       │   ├── queues/
│       │   ├── telemetry/
│       │   ├── control/
│       │   └── ota/
│       ├── package.json
│       └── tsconfig.json
├── packages/
│   ├── db/
│   │   ├── prisma/schema.prisma
│   │   ├── prisma/seed.ts
│   │   └── src/client.ts
│   ├── domain/
│   │   ├── src/auth/
│   │   ├── src/devices/
│   │   ├── src/topics/
│   │   ├── src/signatures/
│   │   └── src/errors.ts
│   ├── config/
│   │   └── src/env.ts
│   └── device-simulator/
│       ├── mqtt-simulator/
│       └── http-simulator/
├── deploy/
│   ├── docker-compose.yml
│   ├── emqx/
│   ├── nginx/
│   └── lightweight/
├── docs/
│   ├── iot-platform-prd.md
│   ├── api/
│   ├── device-integration/
│   ├── deployment/
│   └── superpowers/plans/
├── scripts/
│   ├── dev-up.sh
│   ├── dev-down.sh
│   ├── seed-demo-data.ts
│   └── run-smoke-tests.ts
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```

Package responsibilities:

| Package | Responsibility |
| --- | --- |
| `apps/web` | Next.js admin UI, Route Handlers, Server Actions, auth middleware, EMQX callbacks, HTTP device APIs |
| `apps/worker` | BullMQ consumers, telemetry persistence, command timeout handling, OTA scheduling |
| `packages/db` | Prisma schema, migrations, generated client, seed data |
| `packages/domain` | Topic parsing, signatures, ID generation, status machines, shared error codes |
| `packages/config` | Environment parsing and validation |
| `packages/device-simulator` | MQTT and HTTP device simulation scripts |

Feature directories inside `apps/web/features`:

| Directory | Responsibility |
| --- | --- |
| `identity` | Users, organizations, roles, permissions, invitations, login |
| `products` | Product CRUD, protocol config, thing model JSON |
| `devices` | Devices, groups, credentials, online status, device shadow |
| `ingress` | EMQX auth/ACL/WebHook and HTTP device access |
| `control` | Sync/async command APIs, command records, command result handling |
| `ota` | Firmware metadata, upload URL, OTA tasks, progress APIs |
| `logs` | Device logs, command logs, OTA logs, audit logs |
| `notifications` | SSE event stream for admin UI |

Domain package boundaries:

| Domain area | Put in `packages/domain` | Do not put in `packages/domain` |
| --- | --- | --- |
| IDs and errors | ID prefix helpers, shared error codes, error mapping | HTTP response objects, toast copy |
| Auth primitives | Password hash wrapper interfaces, token claim types, permission decision helpers | Next.js cookies, sessions, route middleware |
| Device protocol | MQTT username parsing, Topic parser, HTTP signature canonical string, HMAC verification | Prisma queries, EMQX request handlers |
| Thing model | Minimal thing model schema, property/service/event validation helpers | React form rendering |
| State machines | Command state transitions, OTA record state transitions, shadow version merge helpers | Worker queue execution and database writes |

`apps/web/features/*` owns HTTP/API orchestration, permission loading, Prisma reads and writes, UI components, and server actions. `apps/worker/src/*` owns queue consumption, retries, scheduled jobs, and persistence side effects. Both may import `packages/domain`, but `packages/domain` must not import from `apps/web`, `apps/worker`, or `packages/db`.

## 4. Core Data Model Checklist

Create the first Prisma migration with these model groups so later tasks can add behavior without repeated destructive migration churn.

Identity and tenancy:

| Model | Required fields and constraints |
| --- | --- |
| `Organization` | `id`, `name`, `status`, `created_at`, `updated_at` |
| `User` | `id`, unique `account`, `password_hash`, `display_name`, `status`, `last_login_at`, timestamps |
| `Role` | `id`, nullable `org_id`, `code`, `name`, `description`, timestamps |
| `Permission` | `id`, unique `code`, `name`, `module`, `created_at` |
| `RolePermission` | unique `(role_id, permission_id)` |
| `UserOrgRole` | unique `(user_id, org_id, role_id)`, `status`, timestamps |
| `Invitation` | unique `code_hash`, `org_id`, `role_id`, `max_uses`, `used_count`, `expires_at`, `status`, `created_by`, `created_at` |

Products and devices:

| Model | Required fields and constraints |
| --- | --- |
| `Product` | `org_id`, unique `product_key`, `protocols`, `auth_type`, `data_format`, `thing_model`, soft delete |
| `Device` | `org_id`, `product_id`, `device_key`, `device_secret_hash`, `status`, `online_status`, `firmware_version`, `tags`, heartbeat timestamps, soft delete, unique `(product_id, device_key)` |
| `DeviceGroup` | `org_id`, required `product_id` for MVP, `name`, `description`, soft delete |
| `DeviceGroupMember` | unique `(group_id, device_id)` |
| `DeviceShadow` | primary `device_id`, `org_id`, `reported`, `desired`, `version`, `updated_at` |

Control, OTA, and logs:

| Model | Required fields and constraints |
| --- | --- |
| `DeviceCommand` | unique `request_id`, `org_id`, `device_id`, `identifier`, `params`, `status`, `result`, `error_code`, `error_message`, `timeout_at`, lifecycle timestamps, `created_by` |
| `Firmware` | `org_id`, `product_id`, `version`, `file_url`, `file_size`, `sha256`, `release_note`, `status`, `created_by`, unique `(product_id, version)` |
| `OtaTask` | `org_id`, `product_id`, `firmware_id`, `name`, `strategy`, `status`, schedule timestamps, `created_by` |
| `OtaRecord` | `org_id`, `task_id`, `device_id`, `status`, `progress`, `error_message`, timestamps, unique `(task_id, device_id)` |
| `DeviceLog` | `org_id`, `product_id`, `device_id`, `type`, `level`, `content`, `occurred_at`, `created_at` |
| `AuditLog` | `org_id`, `user_id`, `action`, `resource_type`, `resource_id`, `ip`, `user_agent`, `detail`, `created_at` |

Enums to define up front:

| Enum | Values |
| --- | --- |
| `ResourceStatus` | `active`, `disabled` |
| `OnlineStatus` | `online`, `offline`, `unknown` |
| `CommandStatus` | `pending`, `sent`, `delivered`, `success`, `failed`, `timeout`, `cancelled` |
| `FirmwareStatus` | `draft`, `released`, `deprecated` |
| `OtaTaskStatus` | `created`, `scheduled`, `running`, `finished`, `cancelled` |
| `OtaRecordStatus` | `created`, `scheduled`, `notified`, `downloading`, `installing`, `success`, `failed`, `cancelled` |
| `LogLevel` | `debug`, `info`, `warn`, `error` |

Required indexes:

| Table | Indexes |
| --- | --- |
| `devices` | `(org_id, online_status)`, `(org_id, product_id, deleted_at)` |
| `device_commands` | `(org_id, device_id, created_at)`, `(status, timeout_at)` |
| `device_logs` | `(org_id, device_id, occurred_at)`, `(org_id, type, occurred_at)` |
| `ota_records` | `(task_id, status)`, `(org_id, device_id, updated_at)` |
| `audit_logs` | `(org_id, created_at)`, `(user_id, created_at)`, `(resource_type, resource_id)` |

## 5. Delivery Plan

Recommended staffing:

| Role | Count | Responsibility |
| --- | --- | --- |
| Full-stack TypeScript engineer | 2 | Next.js APIs, admin UI, Prisma model, domain logic |
| Device/QA engineer | 1 | MQTT/HTTP simulators, integration tests, protocol validation |
| DevOps engineer | 0.5 | Docker Compose, EMQX, MinIO, log rotation, backup |
| Product/UX | 0.5 | Page flow, copy, acceptance review |

Recommended timeline: 13 weeks for MVP.

| Week | Focus | Main Deliverables |
| --- | --- | --- |
| 1 | Engineering Foundation | pnpm workspace, Next.js app, Docker Compose, shadcn/ui, health endpoint, EMQX dev wiring |
| 2 | Data Foundation | Prisma schema, seed data, domain package contracts, first migration |
| 3 | Identity | Invitation registration, login, org switching, RBAC, admin bootstrap |
| 4 | Product Management | Product CRUD, thing model schema, product UI, access guide |
| 5 | Device Management | Device CRUD, credentials, same-product groups, device shadow |
| 6 | MQTT Ingress | EMQX auth, ACL, WebHook, MQTT simulator, online status |
| 7 | Telemetry and Logs | Property/event/log ingestion, shadow updates, device/command/OTA log query |
| 8 | Device Control | Sync command, async command, command reply, SSE updates |
| 9 | HTTP Device Access | HTTP signature, report APIs, pending command pull, HTTP simulator |
| 10 | OTA | Firmware metadata, MinIO upload URL, OTA task, progress tracking |
| 11 | Audit And Permissions | Audit helper, audit API/UI, route guards, button-level permissions |
| 12 | Dashboard, Settings, UI Completion | Dashboard summary, ECharts, settings pages, UI polish, Playwright |
| 13 | Lightweight Deployment | Integration tests, pressure smoke, log rotation, backup, security checks, docs |

Implementation batches:

| Batch | Tasks | Exit Gate |
| --- | --- | --- |
| Batch 1 | Task 1A, Task 1B, and Task 2 | Local app boots, migration applies, admin can create invitation, invited user can log in |
| Batch 2 | Task 3A, Task 3B, and Task 4 | Product/device management works; MQTT simulator connects, reports properties, and online status is visible |
| Batch 3 | Task 5 and Task 6 | Shadow updates, logs query, sync and async commands work with simulator |
| Batch 4 | Task 7 and Task 8 | HTTP simulator reports and receives commands; OTA task completes through simulator |
| Batch 5 | Task 9A, Task 9B, and Task 10 | UI is complete, smoke tests pass, deployment docs and backup/restore are usable |

Do not start the next batch until the previous batch's tests and acceptance checks pass.

## 6. Milestone Tasks

### Task 1A: Engineering Foundation

**Files:**

- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `apps/web/package.json`
- Create: `apps/web/app/layout.tsx`
- Create: `apps/web/app/page.tsx`
- Create: `apps/web/app/api/v1/health/route.ts`
- Create: `apps/web/components/ui/`
- Create: `apps/web/lib/api-response.ts`
- Create: `apps/web/lib/request-id.ts`
- Create: `packages/domain/package.json`
- Create: `packages/domain/src/errors.ts`
- Create: `packages/config/package.json`
- Create: `packages/config/src/env.ts`
- Create: `apps/worker/package.json`
- Create: `apps/worker/src/index.ts`
- Create: `deploy/docker-compose.yml`
- Create: `deploy/emqx/dev.conf`
- Create: `scripts/dev-up.sh`
- Create: `scripts/dev-down.sh`

- [ ] Create pnpm workspace with `apps/*` and `packages/*`.
- [ ] Create Next.js 16+ App Router project in `apps/web`.
- [ ] Add TypeScript, Tailwind CSS, shadcn/ui, ESLint, Prettier, Vitest, Playwright, Prisma, Redis, BullMQ, MinIO SDK, MQTT.js, Zod, bcrypt or Argon2, and jose.
- [ ] Add PostgreSQL, Redis, EMQX, MinIO, web, and worker services to Docker Compose.
- [ ] Configure Docker Compose networking so EMQX can call the web container by service name, for example `http://web:3000/api/internal/emqx/auth`.
- [ ] Add separate EMQX development config for Auth, ACL, and WebHook callback URLs.
- [ ] Add shared response helper returning `code`, `message`, `request_id`, and `data`.
- [ ] Add error codes from the PRD to `packages/domain/src/errors.ts`.
- [ ] Add environment validation for database, Redis, EMQX, MinIO, JWT, and public app URL.
- [ ] Add `GET /api/v1/health`.
- [ ] Add basic app shell with shadcn/ui theme and empty console layout.
- [ ] Run: `pnpm install`.
- [ ] Run: `pnpm test`.
- [ ] Run: `pnpm --filter @ziot/web build`.
- [ ] Commit: `chore: scaffold nextjs iot platform`.

Acceptance:

- `docker compose -f deploy/docker-compose.yml up` starts PostgreSQL, Redis, EMQX, MinIO, web, and worker.
- `GET /api/v1/health` returns `code = 0`.
- Admin shell renders without runtime errors.
- EMQX development config points callbacks to the web service inside Docker Compose.

### Task 1B: Data Foundation And Domain Contracts

**Files:**

- Create: `packages/db/package.json`
- Create: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/seed.ts`
- Create: `packages/db/src/client.ts`
- Create: `packages/domain/src/auth/permissions.ts`
- Create: `packages/domain/src/devices/thing-model.ts`
- Create: `packages/domain/src/devices/shadow.ts`
- Create: `packages/domain/src/topics/index.ts`
- Create: `packages/domain/src/signatures/http.ts`
- Create: `packages/domain/src/signatures/mqtt.ts`
- Create: `packages/domain/src/control/command-state.ts`
- Create: `packages/domain/src/ota/ota-state.ts`
- Modify: `apps/web/package.json`
- Modify: `apps/worker/package.json`

- [ ] Define Prisma models for organizations, users, roles, permissions, invitations, products, devices, device groups, device shadows, device commands, firmwares, OTA tasks, OTA records, device logs, and audit logs.
- [ ] Make `DeviceGroup.product_id` required for MVP.
- [ ] Add enums for resource status, online status, command status, firmware status, OTA task status, OTA record status, and log level.
- [ ] Add indexes listed in the PRD recommended index section.
- [ ] Add seed data for platform admin, default organization, default roles, default permissions, one product, and two demo devices.
- [ ] Define domain contracts for permission decisions, thing model validation, shadow merge, Topic parsing, HTTP/MQTT signature validation, command state transitions, and OTA state transitions.
- [ ] Add unit tests for all domain contracts.
- [ ] Enforce 80%+ coverage for `packages/domain`.
- [ ] Run: `pnpm prisma migrate dev --schema packages/db/prisma/schema.prisma --name init_core_schema`.
- [ ] Run: `pnpm test -- --run domain`.
- [ ] Commit: `chore: add prisma schema and domain contracts`.

Acceptance:

- Prisma migrations apply from an empty database.
- Seed creates admin, organization, roles, permissions, product, MQTT device, and HTTP device.
- `packages/domain` has no import from `apps/web`, `apps/worker`, or `packages/db`.
- Domain tests cover Topic parsing, signatures, thing model validation, command state machine, OTA state machine, and permission decisions.

### Task 2: Identity, Invitation, Organization, And RBAC

**Files:**

- Create: `apps/web/features/identity/`
- Create: `apps/web/app/(auth)/login/page.tsx`
- Create: `apps/web/app/(auth)/register/page.tsx`
- Create: `apps/web/app/(console)/users/page.tsx`
- Create: `apps/web/app/(console)/invitations/page.tsx`
- Create: `apps/web/app/api/v1/auth/register/route.ts`
- Create: `apps/web/app/api/v1/auth/login/route.ts`
- Create: `apps/web/app/api/v1/auth/refresh/route.ts`
- Create: `apps/web/app/api/v1/auth/logout/route.ts`
- Create: `apps/web/app/api/v1/me/route.ts`
- Create: `apps/web/app/api/v1/invitations/route.ts`
- Create: `apps/web/middleware.ts`
- Modify: `packages/db/prisma/schema.prisma`
- Modify: `packages/db/prisma/seed.ts`

- [ ] Implement password hashing with Argon2id or bcrypt.
- [ ] Implement JWT access token and refresh token signing with jose.
- [ ] Implement invitation creation, disable, list, detail, and usage records.
- [ ] Store invitation code hashes only; return plain invitation code only at creation time.
- [ ] Implement registration with invitation validation.
- [ ] Implement login, refresh token, logout, current user, and token revocation.
- [ ] Implement organization membership and user organization role binding.
- [ ] Implement current organization context with `current_org_id`.
- [ ] Implement organization switch API and UI selector.
- [ ] Implement multi-role permission union within the current organization.
- [ ] Implement permission helpers that check `org_id` for tenant-owned resources.
- [ ] Seed platform admin, default organization, default roles, and default permissions.
- [ ] Implement login and invitation registration pages with shadcn/ui forms.
- [ ] Implement user list, role list, and invitation management pages.
- [ ] Add API tests for successful registration, expired invitation, overused invitation, disabled user, refresh token, and cross-organization access.
- [ ] Run: `pnpm test -- --run identity`.
- [ ] Commit: `feat: add identity invitation and rbac`.

Acceptance:

- A platform admin can create an invitation.
- A user can register with a valid invitation and receive the invitation's default role.
- A user cannot register with an expired, disabled, or overused invitation.
- A user cannot access another organization's resources.
- Web login persists session and loads current user profile.
- User can switch between organizations they belong to.
- Multiple roles in the same organization combine permissions by union.

### Task 3A: Product Management And Thing Model

**Files:**

- Create: `apps/web/features/products/`
- Create: `apps/web/app/(console)/products/page.tsx`
- Create: `apps/web/app/(console)/products/[productId]/page.tsx`
- Create: `apps/web/app/api/v1/products/route.ts`
- Create: `apps/web/app/api/v1/products/[productId]/route.ts`
- Create: `apps/web/app/api/v1/products/[productId]/thing-model/route.ts`
- Modify: `packages/domain/src/devices/thing-model.ts`

- [ ] Implement product create, update, delete, list, and detail.
- [ ] Generate unique `product_key`.
- [ ] Implement product thing model read and update using the PRD minimal thing model structure.
- [ ] Validate thing model `properties`, `events`, and `services`.
- [ ] Implement product list, product detail, thing model editor, and access guide.
- [ ] Add API tests for product creation, product key uniqueness, thing model validation, product deletion with existing devices, and cross-organization access.
- [ ] Run: `pnpm test -- --run products thing-model`.
- [ ] Commit: `feat: add product management and thing model`.

Acceptance:

- Admin can create a product and view product access parameters.
- Product thing model validates identifiers, data types, service input, and service output.
- Invalid thing models return structured validation errors.
- Product with existing devices cannot be deleted.

### Task 3B: Device Management, Groups, And Shadow

**Files:**

- Create: `apps/web/features/devices/`
- Create: `apps/web/app/(console)/devices/page.tsx`
- Create: `apps/web/app/(console)/devices/[deviceId]/page.tsx`
- Create: `apps/web/app/api/v1/devices/route.ts`
- Create: `apps/web/app/api/v1/devices/[deviceId]/route.ts`
- Create: `apps/web/app/api/v1/devices/[deviceId]/shadow/route.ts`
- Create: `apps/web/app/api/v1/device-groups/route.ts`
- Modify: `packages/domain/src/devices/shadow.ts`

- [ ] Implement device create, update, enable, disable, delete, list, and detail.
- [ ] Generate `device_key` and one-time visible `device_secret`.
- [ ] Store only `device_secret_hash`.
- [ ] Implement reset device secret.
- [ ] Implement same-product device groups and group membership.
- [ ] Reject adding a device to a group that belongs to a different product.
- [ ] Implement device shadow read and desired-state update.
- [ ] Implement device list, create device, device detail, shadow tab, and group management.
- [ ] Document batch import as outside MVP runtime scope; do not implement CSV/Excel parsing in MVP.
- [ ] Add API tests for device secret one-time return, disabled device, duplicate device key, same-product group membership, cross-product group rejection, and shadow versioning.
- [ ] Run: `pnpm test -- --run devices`.
- [ ] Commit: `feat: add device management groups and shadow`.

Acceptance:

- Admin can create a device under a product and retrieve secret once.
- Device secret reset invalidates previous secret.
- Disabled devices cannot be used by ingress authentication.
- Device groups contain devices from only one product.
- Device shadow stores `reported`, `desired`, `version`, and `updated_at`.

### Task 4: MQTT Device Access

**Files:**

- Create: `apps/web/features/ingress/mqtt/`
- Create: `apps/web/app/api/internal/emqx/auth/route.ts`
- Create: `apps/web/app/api/internal/emqx/acl/route.ts`
- Create: `apps/web/app/api/internal/emqx/webhook/route.ts`
- Create: `packages/domain/src/topics/`
- Create: `packages/domain/src/signatures/`
- Create: `deploy/emqx/`
- Create: `packages/device-simulator/mqtt-simulator/`
- Modify: `apps/web/features/devices/`

- [ ] Implement EMQX auth callback.
- [ ] Implement EMQX ACL callback.
- [ ] Implement EMQX WebHook callback.
- [ ] Implement MQTT username parsing for `product_key:device_key`.
- [ ] Implement HMAC-SHA256 password validation.
- [ ] Implement Topic parser for product key, device key, message type, service identifier, and OTA action.
- [ ] Configure EMQX HTTP auth, ACL, and WebHook in `deploy/emqx` for both local Docker Compose and production.
- [ ] Verify local EMQX callbacks use Docker service names and do not depend on `host.docker.internal`.
- [ ] Make WebHook handlers do only authentication, idempotency checks, and queue enqueue before returning.
- [ ] Add BullMQ retry handling for WebHook events.
- [ ] Implement Redis online status cache.
- [ ] Update device online, offline, last heartbeat, and device log records from WebHook events.
- [ ] Add online status compensation using Redis online state and last heartbeat time.
- [ ] Create MQTT simulator that can connect, publish property payload, subscribe command Topic, and reply.
- [ ] Add integration tests with EMQX for successful auth, wrong password, disabled device, wrong Topic publish, and cross-device subscription.
- [ ] Run: `pnpm test -- --run mqtt ingress`.
- [ ] Commit: `feat: integrate mqtt ingress with emqx`.

Acceptance:

- MQTT simulator connects with valid credentials.
- Invalid secret is rejected.
- Disabled device is rejected.
- Device can publish only its own property, event, and log Topics.
- Device online/offline status changes are visible in API and Web UI.

### Task 5: Telemetry, Device Logs, And Shadow Updates

**Files:**

- Create: `apps/web/features/ingress/telemetry/`
- Create: `apps/web/features/logs/`
- Create: `apps/web/app/api/v1/logs/device/route.ts`
- Create: `apps/web/app/api/v1/logs/commands/route.ts`
- Create: `apps/web/app/api/v1/logs/ota/route.ts`
- Create: `apps/web/app/(console)/logs/device/page.tsx`
- Create: `apps/web/app/(console)/logs/commands/page.tsx`
- Create: `apps/web/app/(console)/logs/ota/page.tsx`
- Create: `apps/worker/src/queues/telemetry.ts`
- Create: `apps/worker/src/telemetry/consume-property-reports.ts`
- Create: `apps/worker/src/telemetry/consume-event-reports.ts`
- Create: `apps/worker/src/telemetry/consume-device-logs.ts`
- Modify: `apps/web/app/api/internal/emqx/webhook/route.ts`
- Modify: `apps/web/features/devices/`

- [ ] Define BullMQ jobs for property report, event report, and device log report.
- [ ] Push MQTT report events into BullMQ.
- [ ] Implement worker consumer for property reports.
- [ ] Update device shadow `reported` when properties are accepted.
- [ ] Implement worker consumer for event reports.
- [ ] Implement worker consumer for device logs.
- [ ] Implement device log list API with filters for org, product, device, type, level, time range, and keyword.
- [ ] Implement command log list API with filters for org, product, device, status, time range, and keyword.
- [ ] Implement OTA log list API with filters for org, product, device, task, status, time range, and keyword.
- [ ] Implement device log, command log, and OTA log pages.
- [ ] Implement device detail log tab.
- [ ] Add retention job config for 7-day device logs, with a configurable maximum of 15 days for lightweight deployments.
- [ ] Add tests for payload validation, oversized payload rejection, shadow version increment, and log filtering.
- [ ] Run: `pnpm test -- --run telemetry logs`.
- [ ] Commit: `feat: add telemetry ingestion and logs`.

Acceptance:

- MQTT property report updates device shadow within 2 seconds in local environment.
- Event and log reports are queryable from the UI.
- Invalid payload returns a structured error or is recorded as rejected.
- Log filtering by device and time range works.

### Task 6: Device Control

**Files:**

- Create: `apps/web/features/control/`
- Create: `apps/web/features/notifications/`
- Create: `apps/web/app/api/v1/devices/[deviceId]/commands/route.ts`
- Create: `apps/web/app/api/v1/devices/[deviceId]/commands:sync/route.ts`
- Create: `apps/web/app/api/v1/device-groups/[groupId]/commands/route.ts`
- Create: `apps/web/app/api/v1/commands/[commandId]/route.ts`
- Create: `apps/web/app/api/v1/events/stream/route.ts`
- Create: `apps/web/app/(console)/devices/[deviceId]/control-panel.tsx`
- Create: `apps/web/app/(console)/devices/[deviceId]/command-records.tsx`
- Create: `apps/worker/src/control/expire-commands.ts`
- Modify: `packages/device-simulator/mqtt-simulator/`

- [ ] Implement command creation with states `pending`, `sent`, `delivered`, `success`, `failed`, `timeout`, and `cancelled`.
- [ ] Implement async command API `POST /api/v1/devices/{device_id}/commands`.
- [ ] Implement sync command API `POST /api/v1/devices/{device_id}/commands:sync`.
- [ ] Ensure sync command route uses Node.js runtime, not Edge runtime.
- [ ] Implement same-product batch command API `POST /api/v1/device-groups/{group_id}/commands`.
- [ ] Reject batch control when the group contains devices from different products or when requested service is not defined on the product thing model.
- [ ] Publish MQTT command to `/sys/{productKey}/{deviceKey}/thing/service/{identifier}/invoke`.
- [ ] Consume service reply Topic and update command status.
- [ ] Use Redis to wait for sync command replies.
- [ ] Implement worker timeout processor for stale commands.
- [ ] Implement SSE event `command.status.changed`; do not implement WebSocket in MVP.
- [ ] Implement control panel from thing model service definitions.
- [ ] Implement command record list and command detail.
- [ ] Add tests for sync success, sync timeout, async success, async timeout, offline device, duplicate reply, and unauthorized control.
- [ ] Run: `pnpm test -- --run control`.
- [ ] Commit: `feat: add device control lifecycle`.

Acceptance:

- Web can send a command to MQTT simulator and receive success result.
- Sync command returns timeout when device does not reply in configured timeout.
- Async command can be queried by `command_id`.
- Command status changes are pushed to Web client.
- Batch control works only for same-product device groups.

### Task 7: HTTP Device Access

**Files:**

- Create: `apps/web/features/ingress/http-device/`
- Create: `apps/web/app/api/device-api/v1/properties/route.ts`
- Create: `apps/web/app/api/device-api/v1/events/route.ts`
- Create: `apps/web/app/api/device-api/v1/logs/route.ts`
- Create: `apps/web/app/api/device-api/v1/commands/pending/route.ts`
- Create: `apps/web/app/api/device-api/v1/commands/[requestId]/reply/route.ts`
- Create: `packages/device-simulator/http-simulator/`
- Modify: `apps/web/features/control/`

- [ ] Implement HTTP device signature verification with method, path, timestamp, nonce, and body hash.
- [ ] Store recent nonce values in Redis to reject replay.
- [ ] Implement `POST /device-api/v1/properties`.
- [ ] Implement `POST /device-api/v1/events`.
- [ ] Implement `POST /device-api/v1/logs`.
- [ ] Implement `GET /device-api/v1/commands/pending`.
- [ ] Implement `POST /device-api/v1/commands/{requestId}/reply`.
- [ ] Implement HTTP simulator for property report, command polling, and command reply.
- [ ] Add tests for valid signature, invalid signature, expired timestamp, replayed nonce, disabled device, pending command pull, and command reply.
- [ ] Run: `pnpm test -- --run http-device`.
- [ ] Commit: `feat: add http device ingress`.

Acceptance:

- HTTP simulator can report properties and update shadow.
- HTTP simulator can pull pending commands and reply.
- Replayed request is rejected.
- Expired timestamp is rejected.

### Task 8: OTA Firmware And Upgrade Tasks

**Files:**

- Create: `apps/web/features/ota/`
- Create: `apps/web/app/api/v1/firmwares/route.ts`
- Create: `apps/web/app/api/v1/firmwares/[firmwareId]/route.ts`
- Create: `apps/web/app/api/v1/firmwares/[firmwareId]/upload-url/route.ts`
- Create: `apps/web/app/api/v1/ota/tasks/route.ts`
- Create: `apps/web/app/api/v1/ota/tasks/[taskId]/route.ts`
- Create: `apps/web/app/api/v1/ota/tasks/[taskId]/start/route.ts`
- Create: `apps/web/app/api/v1/ota/tasks/[taskId]/cancel/route.ts`
- Create: `apps/web/app/api/v1/ota/tasks/[taskId]/records/route.ts`
- Create: `apps/web/app/api/device-api/v1/ota/tasks/current/route.ts`
- Create: `apps/web/app/api/device-api/v1/ota/tasks/[taskId]/progress/route.ts`
- Create: `apps/web/app/(console)/ota/firmwares/page.tsx`
- Create: `apps/web/app/(console)/ota/tasks/page.tsx`
- Create: `apps/web/app/(console)/ota/tasks/[taskId]/page.tsx`
- Create: `apps/worker/src/ota/schedule-tasks.ts`
- Modify: `packages/device-simulator/mqtt-simulator/`
- Modify: `packages/device-simulator/http-simulator/`

- [ ] Implement firmware create, list, detail, release, and deprecate.
- [ ] Implement MinIO upload URL generation.
- [ ] Store firmware file URL, file size, SHA256, version, release note, and product ID.
- [ ] Implement OTA task create, start, cancel, list, detail, and records.
- [ ] Implement target device selection by product, explicit device IDs, and device group.
- [ ] Implement OTA notify for MQTT device.
- [ ] Implement current OTA task query for HTTP device.
- [ ] Implement OTA progress report handling for MQTT and HTTP.
- [ ] Implement firmware list, upload firmware, OTA task list, create task, and task detail pages.
- [ ] Add tests for firmware version uniqueness, SHA256 requirement, OTA target selection, progress update, failed upgrade, cancelled task, and unauthorized task access.
- [ ] Run: `pnpm test -- --run ota`.
- [ ] Commit: `feat: add ota firmware and upgrade tasks`.

Acceptance:

- Admin can create firmware metadata and upload a package through MinIO pre-signed URL.
- Admin can create an OTA task and start it.
- MQTT simulator receives OTA notification and reports progress.
- HTTP simulator can query current OTA task and report progress.
- OTA task detail shows success, failed, and in-progress counts.

### Task 9A: Audit And Permission Completion

**Files:**

- Create: `apps/web/features/logs/audit/`
- Create: `apps/web/app/api/v1/audit-logs/route.ts`
- Create: `apps/web/app/(console)/logs/audit/page.tsx`
- Modify: `apps/web/features/identity/`
- Modify: `apps/web/features/notifications/`

- [ ] Implement audit helper for create, update, delete, login, control, OTA, and secret reset operations.
- [ ] Implement audit log list API with filters for user, action, resource, IP, and time range.
- [ ] Implement audit log page.
- [ ] Implement global route permission guard and per-button permission checks.
- [ ] Add tests for audit creation, audit filters, current organization behavior, multi-role permission union, and route permission behavior.
- [ ] Run: `pnpm test -- --run audit permissions`.
- [ ] Commit: `feat: add audit logs and permission completion`.

Acceptance:

- All critical write operations produce audit logs.
- Read-only users cannot see or trigger write buttons.
- Organization admin cannot access other organizations.
- Audit logs are queryable by user, action, resource, IP, and time range.

### Task 9B: Dashboard, Settings, And UI Completion

**Files:**

- Create: `apps/web/features/dashboard/`
- Create: `apps/web/features/settings/`
- Create: `apps/web/app/api/v1/dashboard/summary/route.ts`
- Create: `apps/web/app/(console)/dashboard/page.tsx`
- Create: `apps/web/app/(console)/settings/page.tsx`
- Modify: `apps/web/app/(console)/products/page.tsx`
- Modify: `apps/web/app/(console)/devices/page.tsx`
- Modify: `apps/web/app/(console)/devices/[deviceId]/page.tsx`
- Modify: `apps/web/app/(console)/ota/tasks/page.tsx`
- Modify: `apps/web/features/notifications/`

- [ ] Implement dashboard summary API for total devices, online devices, today reports, today commands, OTA running tasks, and recent errors.
- [ ] Implement dashboard page with ECharts.
- [ ] Implement settings pages for organization info, MQTT access config, object storage config display, and security settings display.
- [ ] Complete product, device, command, OTA, log, and audit navigation links.
- [ ] Add empty states, loading states, error states, and permission-denied states.
- [ ] Add read-only UI assertions for all write buttons.
- [ ] Run: `pnpm test -- --run dashboard`.
- [ ] Run: `pnpm --filter @ziot/web exec playwright test`.
- [ ] Commit: `feat: add dashboard settings and ui completion`.

Acceptance:

- Dashboard shows current device and operation summary.
- Settings page shows organization, MQTT, object storage, and security configuration.
- Product, device, command, OTA, log, and audit pages are reachable from navigation.
- Playwright covers login, product creation, device creation, command flow, OTA task flow, and read-only restrictions.

### Task 10: Lightweight Deployment And Hardening

**Files:**

- Modify: `deploy/docker-compose.yml`
- Create: `deploy/nginx/`
- Create: `deploy/lightweight/`
- Create: `docs/api/`
- Create: `docs/device-integration/`
- Create: `docs/deployment/`
- Create: `scripts/seed-demo-data.ts`
- Create: `scripts/run-smoke-tests.ts`

- [ ] Add Nginx HTTPS reverse proxy sample config.
- [ ] Add web, worker, EMQX, PostgreSQL, Redis, and MinIO health checks.
- [ ] Add lightweight Docker Compose resource limits for 2 CPU cores and 4 GB RAM.
- [ ] Add PostgreSQL lightweight config with `shared_buffers=256MB`, `work_mem=4MB`, `maintenance_work_mem=128MB`, and `max_connections=30`.
- [ ] Add Redis lightweight config with `maxmemory=256mb` and `maxmemory-policy=allkeys-lru`.
- [ ] Add Docker log rotation config with 50MB max file size and 3 retained files.
- [ ] Add EMQX lightweight config and keep Dashboard restricted to internal network or VPN.
- [ ] Add database backup script and restore instructions.
- [ ] Add seed demo data script for one organization, one product, one MQTT device, one HTTP device, and one operator user.
- [ ] Add smoke test script for registration, login, product creation, device creation, MQTT connect, property report, command control, HTTP report, and OTA progress.
- [ ] Write API integration guide in `docs/api/`.
- [ ] Write device MQTT and HTTP integration guide in `docs/device-integration/`.
- [ ] Write private deployment guide in `docs/deployment/`.
- [ ] Write lightweight sizing guide for 2 CPU cores, 4 GB RAM, and 70 GB disk.
- [ ] Run local smoke tests.
- [ ] Run lightweight pressure smoke: 100 MQTT connections, 5 messages per second for 5 minutes, and 20 sync commands.
- [ ] Run MVP acceptance pressure test: 300 MQTT connections, 15 messages per second for 15 minutes, and 50 sync commands.
- [ ] Run non-blocking capacity exploration: 500 MQTT connections and 20 messages per second, recording bottlenecks without blocking MVP release if the acceptance pressure test passes.
- [ ] Commit: `chore: add lightweight deployment hardening`.

Acceptance:

- A fresh developer can start the platform using the deployment guide.
- Smoke test script passes against local Docker Compose.
- Backup and restore instructions are documented.
- Docker log rotation is configured.
- Lightweight pressure smoke does not crash web, worker, EMQX, PostgreSQL, or Redis.
- MVP acceptance pressure test reaches 300 MQTT connections and 15 messages per second for 15 minutes.

## 7. Cross-Cutting Engineering Rules

Security:

- Store passwords, invitations, and device secrets as hashes.
- Return device secrets only once after creation or reset.
- Enforce `org_id` filtering in every tenant-owned resource query.
- Reject HTTP device requests with expired timestamps or replayed nonces.
- Enable MQTT TLS in production deployment.
- Add rate limits for login, registration, device auth, and device control.

Data:

- Prisma schema is the source of truth for relational data.
- Every business table uses `created_at` and `updated_at`.
- Tenant-owned tables include `org_id`.
- Deleted products and devices use soft delete.
- Logs use indexed `org_id`, `device_id`, `type`, and `occurred_at`.
- Device shadow updates increment `version`.
- Lightweight deployment keeps device logs for 7 days by default, command records for 30 days, OTA records for 180 days, and audit logs for 180 days.
- Firmware packages keep the current version and the latest 2 historical versions by default.

API:

- Every endpoint returns the unified response format.
- Every response includes `request_id`.
- Use Zod schemas for request validation.
- Generate or maintain OpenAPI documentation for mobile, mini-program, and device integrations.
- Add pagination to list APIs.
- Use ISO 8601 strings for returned timestamps.

Frontend:

- Use a dense admin layout, left navigation, top organization/user area, and tabbed detail pages.
- Use shadcn/ui components for forms, tables, dialogs, tabs, dropdowns, and toasts.
- Use confirmation dialogs for secret reset, device disable, product delete, OTA start, and OTA cancel.
- Use permission guards for both routes and action buttons.
- Never display stored secrets after the initial create/reset response.
- Use SSE for realtime status in MVP; do not build WebSocket client code in MVP.

Testing:

- Vitest covers domain logic, API handlers, and state machines.
- `packages/domain` must keep 80%+ line coverage and cover critical branches for signatures, Topic parsing, thing model validation, permissions, command states, and OTA states.
- Playwright covers login, product creation, device creation, command flow, and OTA UI.
- Integration tests cover PostgreSQL, Redis, EMQX, MinIO, and worker behavior.
- Device simulators are required for MQTT, HTTP, command, and OTA flows.

## 8. Release Gates

### Alpha Gate

Alpha is ready when:

- Identity, product, device, MQTT ingress, telemetry, and sync command work locally.
- Admin UI supports login, product management, device management, device detail, and control panel.
- MQTT simulator proves connect, report, command, and reply.

### Beta Gate

Beta is ready when:

- HTTP device access works.
- OTA works with simulator.
- Logs and audit are visible in UI.
- Docker Compose environment starts consistently from a clean machine.
- Smoke test script passes.
- Lightweight log retention and backup scripts are configured.

### MVP Release Gate

MVP is ready when:

- All functional acceptance items in the PRD pass.
- Cross-organization access tests return 403.
- Device secret reset invalidates old secret.
- Replayed HTTP device request is rejected.
- 300 MQTT connections can run with 15 messages per second for 15 minutes without service crash on the lightweight server profile.
- API P95 for normal admin APIs is under 500ms in local test environment with seeded data.
- Deployment, API, and device integration docs are present.

## 9. Test Matrix

Run these test groups before each release gate. A task is not complete until its direct tests and relevant cross-cutting tests pass.

| Test Group | Command Pattern | Required Coverage |
| --- | --- | --- |
| Domain unit tests | `pnpm test -- --run domain` | Topic parsing, HMAC signatures, HTTP signature strings, command state machine, OTA state machine, permission helpers |
| Identity API tests | `pnpm test -- --run identity` | Registration, login, refresh, logout, invitation expiry, invitation overuse, disabled user, role checks |
| Tenant isolation tests | `pnpm test -- --run tenancy` | Product, device, command, OTA, log, and audit APIs reject cross-org access with 403 |
| Device management tests | `pnpm test -- --run products devices` | Product CRUD, device secret one-time display, secret reset, disabled device behavior, shadow versioning |
| MQTT integration tests | `pnpm test -- --run mqtt ingress` | EMQX auth, ACL, webhook, valid report, invalid secret, wrong Topic, cross-device subscribe |
| Telemetry worker tests | `pnpm test -- --run telemetry logs` | Queue creation, worker consumption, shadow update, invalid payload rejection, log retention query |
| Control tests | `pnpm test -- --run control` | Sync success, sync timeout, async success, duplicate reply, offline device, unauthorized control |
| HTTP device tests | `pnpm test -- --run http-device` | Valid signature, invalid signature, expired timestamp, replay nonce, pending command pull, command reply |
| OTA tests | `pnpm test -- --run ota` | Firmware version uniqueness, SHA256 requirement, target selection, progress update, cancel, failure |
| UI E2E tests | `pnpm --filter @ziot/web exec playwright test` | Login, product creation, device creation, device detail, command flow, OTA task flow, read-only restrictions |
| Smoke tests | `pnpm smoke` | Compose boot, health, seed data, MQTT report, command, HTTP report, OTA progress |
| Lightweight pressure smoke | `pnpm smoke:lightweight` | 100 MQTT connections, 5 messages/second for 5 minutes, 20 sync commands |
| MVP acceptance pressure | `pnpm pressure:mvp` | 300 MQTT connections, 15 messages/second for 15 minutes, 50 sync commands |
| Capacity exploration | `pnpm pressure:capacity` | 500 MQTT connections, 20 messages/second, bottleneck report only |

Manual acceptance checklist:

- Create platform admin from seed.
- Create invitation and register an operator.
- Create product with MQTT and HTTP enabled.
- Create one MQTT device and one HTTP device.
- Connect MQTT simulator and confirm online status.
- Report MQTT properties and confirm shadow update.
- Send sync command and confirm success result.
- Stop simulator and confirm sync command timeout.
- Report HTTP properties with valid signature.
- Replay the same HTTP request and confirm rejection.
- Upload firmware through pre-signed URL.
- Start OTA task and confirm simulator progress reaches success.
- Confirm audit logs exist for invitation creation, device creation, control, secret reset, and OTA start.
- Confirm read-only user cannot see write buttons and write APIs return 403.

## 10. Risk Controls

| Risk | Control |
| --- | --- |
| Next.js request handlers receive too much device traffic | Route device reports into BullMQ quickly and process persistence in worker |
| Worker and web logic diverge | Keep topic parsing, signatures, status machines, and error codes in `packages/domain` |
| Prisma becomes inefficient for high-volume logs | Use `createMany`, proper indexes, retention jobs, and later migrate telemetry history to ClickHouse |
| 2 CPU cores and 4 GB RAM are exhausted | Keep Prometheus, Grafana, ClickHouse, TimescaleDB, video services, and rule engine out of default deployment |
| 70 GB disk fills up | Enable Docker log rotation, short log retention, firmware retention, and database backup cleanup |
| Serverless deployment conflicts with MQTT callbacks and workers | Use self-hosted Node.js and Docker Compose for MVP |
| Scope grows beyond MVP | Keep visual dashboard, video, rule engine, SaaS billing, and time-series analytics out of first implementation |
| EMQX integration blocks progress | Build MQTT simulator and EMQX auth/ACL tests in Week 4 |
| Device protocol changes repeatedly | Freeze JSON Topic and HTTP contract before Week 4 implementation starts |
| Sync control unreliable on weak networks | Provide async command as first-class API and use sync only for short commands |
| OTA failures damage devices | Require SHA256, gray release, progress reporting, failure status, and device-side rollback guidance |
| Permission bugs leak tenant data | Add org isolation tests to every module before UI completion |

## 11. Documentation Deliverables

- `docs/api/admin-api.md`.
- `docs/api/device-api.md`.
- `docs/device-integration/mqtt-device-guide.md`.
- `docs/device-integration/http-device-guide.md`.
- `docs/device-integration/ota-guide.md`.
- `docs/deployment/private-deployment.md`.
- `docs/deployment/lightweight-single-node.md`.
- `docs/deployment/backup-restore.md`.
- `docs/deployment/log-rotation-and-retention.md`.
- `docs/release/mvp-acceptance-report.md`.

## 12. First Implementation Batch

The first implementation batch should stop after Task 2.

Batch goal:

- pnpm workspace.
- Next.js app shell.
- Prisma schema and migration.
- Docker Compose boot.
- Health endpoint.
- Domain contracts and 80%+ `packages/domain` coverage.
- Invitation registration.
- Login and RBAC.
- Organization switching.
- Basic auth UI.

Batch verification commands:

```bash
pnpm install
pnpm prisma migrate dev --schema packages/db/prisma/schema.prisma --name init_core_schema
pnpm test
pnpm --filter @ziot/web build
docker compose -f deploy/docker-compose.yml up --build
curl http://localhost:3000/api/v1/health
```

Expected results:

- Dependencies install successfully.
- Prisma migration applies to PostgreSQL.
- Tests pass.
- Next.js build completes.
- Docker Compose services become healthy.
- Health endpoint returns `code = 0`.
