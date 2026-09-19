# Local setup and deployment

Use the pinned Node 22 LTS runtime in `.nvmrc` and pnpm 10.17.1. Docker Desktop and Supabase CLI are prerequisites for local Supabase. PostgreSQL 17 is used by local configuration. No Redis is needed.

```
nvm install
nvm use
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
pnpm db:start
pnpm db:migrate
supabase status
```

Copy the local URL, anon/publishable key and service-role/secret key into `.env` privately. Local database connections are shown by `supabase status`. Generate each voucher/context key separately with `openssl rand -hex 32`. Configure DATABASE_ADMIN_URL for bootstrap/seed and DATABASE_URL for runtime. Use different roles in production. Do not replace existing keys on a database containing vouchers.

```
pnpm db:seed
pnpm staff:create
pnpm dev
```

Before `staff:create`, provide `STAFF_INITIAL_PASSWORD` through a secret manager or a shell prompt that does not echo the password; do not put a real password into shell history. For zsh: `read -s 'STAFF_INITIAL_PASSWORD?Initial password: '; export STAFF_INITIAL_PASSWORD`. After creation: `unset STAFF_INITIAL_PASSWORD`. The CLI prompts for email, display name and ADMIN/CASHIER. It creates Supabase Auth and a protected staff profile. Public registration is not supported. The local seed inserts only three explicitly marked demonstration packages and the site; no password is seeded.

Web: http://127.0.0.1:5188, API: http://127.0.0.1:4000. The frontend internal API URL must match that API port. Root `pnpm dev` starts web/API/worker together and loads root `.env`. A project copied from the old application needs the new names in `.env.example`; old variable names are not silently treated as new secrets. Staff page mutations go to Fastify on the server; portal assets and status checks remain same-origin.

For a hosted Supabase database:
1. Back up existing data; inspect the new canonical SQL. It creates only `wifi` tables plus runtime-role grants and Supabase migration history, and never drops existing public tables.
2. Use `supabase link --project-ref YOUR_REF` and `supabase db push` for normal release migration. Alternatively, `pnpm db:migrate:direct` applies those same SQL files in a transaction and records versions in `supabase_migrations.schema_migrations` so it remains compatible with the CLI history. Set DATABASE_ADMIN_URL to the privileged **Session pooler** connection if the deployment cannot reach Supabase IPv6 direct hosts. Percent-encode password URL characters and quote the whole value in `.env`.
3. The migration creates the initial site through the direct runner; with CLI migration, run `pnpm db:migrate:direct` once to ensure the initial site, or run the development seed only in a development project.
4. Create a dedicated login using a separately generated password, grant membership in babu_runtime, and use its connection as DATABASE_URL. Never deploy the admin DB URL to API/worker containers. Supabase pooler custom-role support/username format depends on the configured connection mode; verify with Supabase before deployment. A trusted direct/private connection is an alternative.
5. Disable public signup in Supabase Auth. Set the app origin and confirm staff login behavior. Bootstrap the first ADMIN with the privileged CLI connection.
6. Configure HTTPS public DNS, private/VPN controller routing, CA and manually validated Omada settings. Complete the commissioning checklist before switching a paying-customer service to live.

Container deployment: create `.env.web` with SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, WIFI_BRAND, WIFI_SUPPORT_CONTACT, APP_ORIGIN, ORIGIN (same HTTPS origin), and OMADA_MODE. Create `.env.api` with runtime DATABASE_URL, required app validation variables, voucher/context secrets and controller configuration; omit DATABASE_ADMIN_URL and SUPABASE_SECRET_KEY. The worker currently shares API validation variables but does not contact Supabase Auth. Build with `docker compose build`, then set APP_DOMAIN and run `docker compose up -d`. These commands are deployment examples; no production deployment was performed. The container runs as the non-root node user. API and worker currently run TypeScript through the pinned tsx runtime after the build type-check; the web serves the compiled adapter-node output.

Set ORIGIN explicitly for adapter-node. The reverse proxy reaches internal service ports and obtains HTTPS certificates. Set TRUST_PROXY only to a verified internal proxy address/CIDR when exposing Fastify directly through the proxy; otherwise leave it unset. Do not trust arbitrary X-Forwarded-For. Set appropriate ingress limits for the public portal without starving shared-NAT customers.

Graceful shutdown closes Fastify and PostgreSQL connections and lets the worker finish its bounded in-flight request. A terminated leased attempt is recovered conservatively as NEEDS_REVIEW. Readiness verifies the business schema connection; liveness only verifies the process. Monitor job age and NEEDS_REVIEW separately. Follow backup, key-backup and restore instructions in security.md. Take a backup and rehearse restoring it before every production migration.
