# Verification record — 19 September 2026

Executed successfully:
- `pnpm install --frozen-lockfile` in the Desktop project.
- `pnpm check`: TypeScript and Svelte checks; zero Svelte errors/warnings.
- `pnpm lint`.
- `pnpm test`: 13 unit and Fastify injection tests passed.
- `pnpm test:integration`: 17 tests passed against isolated real PostgreSQL 17.
- `pnpm test:e2e`: 2 Chrome browser tests passed against local Supabase with mock Omada, including the complete package → batch → sale → print → customer activation flow.
- `pnpm build`: successful SvelteKit adapter-node build and API/worker type checks.
- Dependency audit after compatible security updates: no high/critical advisories; one low advisory remains. Recheck `pnpm audit` before deployment because advisory data changes.
- Canonical migration applied to the user-supplied hosted Supabase project: 16 `wifi` business tables and initial shop site created; existing application tables preserved.
- Restricted `babu_app` runtime login verified against hosted Supabase with CA and hostname-verified TLS.
- Requested administrator account enabled, and its login verified in the actual in-app browser against hosted Supabase. The 403 origin issue was corrected without disabling origin checking.

Not executed: production container deployment, restore drill, live Omada authorization/AP expiry, hardware rate enforcement, or actual network disconnect. These require the separate commissioning checklist and deployment configuration. Browser end-to-end test sales were confined to the local test app; hosted data was not populated with fake sales.

Local running app: Desktop/mikrotik; web 5188, API 4000, separate worker. OMADA_MODE remains mock. No real network configuration was changed.


## MikroTik preparation — 19 September 2026

24 unit/API tests and 19 isolated PostgreSQL integration tests passed, including speed validation, immutable voucher/sale snapshots, restricted diagnostics and the live-mode block. Svelte/TypeScript check and lint passed; production web build passed. Additive speed migration applied to the existing preview database without backfilling old terms. Local preview remains on 5188, API on 4000. Read-only router checker is implemented; MikroTik customer authorization, physical expiry/speed tests and VPS deployment are not completed in this preparation release.
