# Testing

```
pnpm check
pnpm lint
pnpm test
pnpm build
```

`pnpm test` covers voucher entropy/normalization/authenticated encryption, CSV injection, mock outcomes, context checks, fail-safe live configuration and Fastify input/auth/origin boundaries.

Integration tests require a separate real PostgreSQL database, never the application's data. Default: `postgresql://postgres@127.0.0.1:55432/babu_wifi_test`. Set TEST_DATABASE_URL to another **localhost database whose name ends in `_test`**. The suite drops and rebuilds only its `wifi` schema and makes minimal Supabase role/auth-table fixtures. It refuses hosted databases. The test user needs create-role/schema permissions.

Example disposable local DB (localhost only):
```
docker run --name babu-wifi-test-db -p 127.0.0.1:55432:5432 -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=babu_wifi_test -d postgres:17-alpine
pnpm test:integration
```

The trust setting is exclusively for this disposable loopback test database; never use it for an application deployment.

The 17 integration cases exercise immutable snapshots/history, unsold/voided/expired codes, duplicate and competing cash sales, competing device binding, same-MAC deadlines, rejection/timeout/restart recovery, reversal/revocation, disabled staff, cashier restrictions, secret-free list responses, actual schema privileges, revenue exclusion and Tanzania date boundaries.

Browser tests require the local app running in OMADA_MODE=mock with its worker, a real enabled administrator and Google Chrome installed. Set E2E_EMAIL and E2E_PASSWORD securely; optional E2E_BASE_URL defaults to http://127.0.0.1:5188. These tests create clearly named test packages, stock and cash sales in that development app, so never point them at production.
```
pnpm test:e2e
```

The browser flow logs in, creates a package, generates and prints stock, rejects an unsold code, records a cash sale, checks print styles, activates a sold code through the worker and checks mobile layout. The separate portal test checks local-only asset requests and a visible mock banner. Live AP expiry, controller cookies, session-rejection semantics, TLS trust and operator capabilities require the separate hardware commissioning checklist.
