# JIACHIE WIFI architecture

One shop, one site. TTCL → MikroTik routing/firewall → Omada APs → customers.
SvelteKit renders staff pages and the lightweight portal. Its actions are presentation-only: Fastify owns business mutations. PostgreSQL is the source of truth. Supabase Auth is exclusively for staff. Customers never initialize Supabase.

- `apps/web`: Svelte 5, Tailwind, SvelteKit SSR and Node adapter, port 5188.
- `apps/api`: Fastify, TypeBox schemas, verified staff tokens, port 4000.
- `apps/worker`: separately deployable durable authorization/expiry worker.
- `packages/contracts`: API request and response allowlists.
- `packages/database`: SQL transactions, cryptography and shared domain services.
- `packages/omada`: explicit mock/live adapters and capability boundaries.
- `supabase/migrations`: the only canonical migration history.

Business tables live in the non-exposed `wifi` schema. Existing legacy `public` tables are not touched. This is intentionally not an automatic migration of prior multi-business data. The original project files are preserved in the ignored `.babu-backup` folder. Keep that backup outside a production deployment.

No payment gateways, wallets, subscriptions, MikroTik Hotspot APIs, RADIUS, reseller administration, messaging, or native Omada vouchers are implemented.

The database role, application authorization and SSR checks provide separate boundaries. Worker and API import the same grant services. PostgreSQL row locks reserve inventory and first-device binding; network calls occur after the transaction commits.
