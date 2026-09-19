> **MikroTik L009 preparation:** see [VPS deployment and launch checklist](docs/mikrotik-launch.md). This release adds 150 Mbps capacity planning, package speed snapshots and read-only router checks. MikroTik live authorization is still pending implementation and hardware commissioning; keep simulation mode enabled. You deploy the VPS yourself.

# BABU-SHOP WIFI

A single-shop prepaid Wi-Fi voucher counter for Tanzania. Administrators prepare packages and stock; cashiers record cash sales and print vouchers; customers redeem sold codes through an Omada external portal. MikroTik remains the upstream router/firewall. No payment gateway, wallet, subscription, RADIUS, multi-tenant administration or MikroTik Hotspot billing.

## Run locally

Prerequisites: Node from `.nvmrc`, pnpm 10.17.1 via Corepack, Docker Desktop, Supabase CLI. Google Chrome is needed for the supplied browser tests.

```sh
nvm install
nvm use
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env  # For a NEW setup only; preserve an existing .env.
pnpm db:start
pnpm db:migrate
supabase status
```

Fill `.env` privately using the local Supabase values, and generate three independent keys with `openssl rand -hex 32`. Keep `OMADA_MODE=mock`. Match `APP_ORIGIN=http://127.0.0.1:5188` and `API_INTERNAL_URL=http://127.0.0.1:4000`.

```sh
pnpm db:seed
# Read a unique initial password without putting it in shell history (zsh):
read -s 'STAFF_INITIAL_PASSWORD?Initial password: '
export STAFF_INITIAL_PASSWORD
pnpm staff:create
unset STAFF_INITIAL_PASSWORD
pnpm dev
```

The CLI prompts for staff email, display name and ADMIN/CASHIER. No account or password is seeded. Open http://127.0.0.1:5188/login. The API runs on 4000 and the worker starts alongside both services. No hardware is needed for explicit mock mode. A valid mock portal example is `/portal?clientMac=AA:00:00:00:00:11&apMac=AA:BB:CC:DD:EE:01&site=babu-shop&ssidName=BABU-SHOP%20WIFI&radioId=0`; the code must have been SOLD first. Do not put voucher codes in URLs.

For the supplied hosted database, `pnpm db:migrate:direct` reads DATABASE_ADMIN_URL and applies the exact canonical Supabase migration files transactionally, recording Supabase CLI-compatible history. Use the IPv4-compatible Session pooler on networks that cannot reach direct IPv6 hosts. This command adds the initial site but does not insert demonstration packages. It never drops legacy tables. Hosted auth must have public signup disabled. Full instructions and restricted-role setup are in [deployment](docs/deployment.md).

## Structure

```text
apps/web             SvelteKit staff UI, print views and customer portal
apps/api             Fastify JSON API, auth, validation and OpenAPI
apps/worker          Durable authorization jobs and expiry housekeeping
packages/contracts   TypeBox request/response schemas
packages/database    SQL transactions, crypto and shared business services
packages/omada       Mock/live version-aware external-portal adapter
supabase             Canonical migrations, local config and development seed
infra                Container and HTTPS reverse-proxy examples
scripts              Secure bootstrap, seed and canonical migration runner
tests                Unit, injection, real PostgreSQL and browser workflows
```

## What is protected

- Voucher commercial terms are immutable snapshots; generated stock is not revenue.
- Cash sales and first activation use real PostgreSQL transactions and row locks.
- Duplicate sale confirmations are idempotent; concurrent cashiers cannot sell one code twice.
- Codes have 80 random bits, keyed lookup and AES-GCM recoverable encryption; normal lists are masked.
- Staff roles and enabled status are checked on every API request; customers have no accounts.
- Controller requests happen outside database locks. Timeouts and interrupted sends preserve binding and the original deadline, and require review.
- Printing/reveal/export are audited, permission checked and no-store. Reversals keep the receipt and permanently void unused codes.
- No claim of online-device counts, instant network disconnect or real hardware success is made.

## Checks

```sh
pnpm check
pnpm lint
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
```

Integration and browser prerequisites are explicit in [testing](docs/testing.md). Integration tests only accept a localhost database named `*_test`; never run browser sale tests against a live shop.

## Live Omada gate

Do not switch a customer-facing deployment to live until the exact controller/AP profile, time units, expiry semantics, field types, TLS and two-minute AP expiry trial are verified. Live mode never falls back to mock. Rate-limit packages, lookup, disconnect and automatic reconciliation are unsupported. A MAC is not strong identity. Signing/storing redirect data does not prove Omada supplied it.

Read [business rules](docs/business-rules.md), [Omada integration](docs/omada-integration.md), [commissioning](docs/omada-commissioning.md), [security](docs/security.md), and [deployment](docs/deployment.md). A passing build or mock test does not make a deployment commissioned for real network use.
