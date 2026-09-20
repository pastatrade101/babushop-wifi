# MikroTik voucher deployment — JIACHIE WIFI

This release implements MikroTik voucher authentication and fixed expiry using RADIUS. It has automated tests; deployment and physical voucher acceptance tests remain the operator's responsibility. Do not treat the read-only HTTPS check as commissioning. Nothing in this change deploys to the VPS or changes the router automatically.

## Existing installation

- Website: https://jiachie-wifi.com, shared containerised Caddy. Keep the existing Caddy and other sites unchanged.
- VPS WireGuard: `wg-babu`, `10.77.0.1`; router: `10.77.0.2`.
- Customer bridge: `babu-guest`, gateway `10.78.0.1`, DHCP working; EAP225 injector on ether2.
- HotSpot: `babu-hotspot`, profile `babu-hotspot-profile`, `login-by=http-chap`.
- Management Wi-Fi remains on bridge `192.168.88.1`. Customer firewall separation and FastTrack exceptions have been prepared. Do not delete the commissioning drop rules: authenticated internet allow rules precede them.
- The separate local test account demonstrated a 5 Mbps queue and 10-minute session timeout. This does NOT yet test the portal's RADIUS path.

## How authentication and expiry work

The branded page lives on the MikroTik, so it loads before internet authorization and needs no broad cloud walled garden. Customers enter ONE voucher code. The page normalizes it and sends a CHAP challenge response, with the same normalized code as the username. It does not send a plain password or use the router administrator account.

MikroTik sends authenticated RADIUS requests over WireGuard. Only source/NAS `10.77.0.2`, the configured HotSpot name, valid Message-Authenticator and CHAP proof are accepted. The database verifies SOLD status and locks the voucher row. First valid authorization records its device and a fixed expiry. Retransmissions and reconnects use that same deadline. Old simulation/Omada grants cannot be silently activated on real hardware; issue fresh vouchers for live tests.

The activation transaction commits before an Access-Accept is transmitted. A lost reply can therefore start the clock even if the phone never receives access. It never grants fresh time on retry: this conservative boundary avoids ambiguous network outcomes extending validity.

Every Access-Accept includes the remaining Session-Timeout, one simultaneous user and the voucher's immutable upload/download limits. Codes without speed terms use the explicit fallback speed settings. Five seconds are subtracted for the <=3s RADIUS response window and delivery latency. Keep VPS time synchronized. No late (>2.5s processing) or cached Accept is sent. The router enforces the session timeout if the VPS/worker goes offline; reconnecting after expiry is rejected by the database regardless of worker housekeeping. Expiry continues while disconnected. Do not configure cookie, MAC-cookie, trial, MAC authentication or local voucher-user fallback.

CHAP here is the existing RouterOS captive-portal mechanism over a local HTTP login page; it is not end-to-end HTTPS. Keep voucher codes high-entropy as generated. A trusted customer-facing HotSpot certificate is a separate upgrade; never reuse/expose router-management credentials.

## 1. Apply the additive database migration

Back up using the existing database backup process. Apply `supabase/migrations/202609200001_mikrotik_radius.sql` once using your established migration mechanism (Supabase SQL editor is also suitable). It adds grant provider tags and a session table; it does not change sales, code keys, or old deadlines.

For the supplied migration tool, run from the repository with a private env containing `DATABASE_ADMIN_URL`:

```sh
BABU_ENV_FILE=/absolute/path/to/private-migration.env pnpm db:migrate:direct
```

Run that on the checkout (the production image does not contain Supabase migration files). Never put the admin database URL in the web/API/RADIUS runtime containers. Do not run seed or integration tests against production.

## 2. Add the private RADIUS service

Copy `infra/deployment/radius.env.template` to `.env.radius` and chmod it 600. Use the SAME runtime DATABASE_URL, VOUCHER_LOOKUP_KEY and VOUCHER_ENCRYPTION_KEY as the API. Never regenerate existing voucher keys.

Generate one NEW RADIUS shared secret (`openssl rand -hex 32`) and enter it privately in `.env.radius`. The identical 64-character value will be entered in WinBox. Do not send it through chat or commit it. Keep the exact WireGuard bind/client addresses, HotSpot name and `babu-vouchers` group from the template. Choose fallback upload/download rates deliberately; the supplied values are 2/5 Mbps, for older vouchers that have no speed fields.

Merge the `radius` service from `docker-compose.radius.yml` into your EXISTING Compose stack or add that file to the stack's usual `-f` arguments. It runs the same application image with `pnpm start:radius` and host networking, binding ONLY `10.77.0.1:1812/udp` and `10.77.0.1:1813/udp`. Host networking preserves the router's source address. It does not publish HTTP ports or join/change Caddy networks. No TLS management credential is required by this service.

Build/start only that service using your existing Compose file arguments:

```sh
docker compose -f YOUR_EXISTING_COMPOSE.yml -f docker-compose.radius.yml up -d --build --no-deps radius
docker compose -f YOUR_EXISTING_COMPOSE.yml -f docker-compose.radius.yml logs --tail=30 radius
ss -lun | grep -E ':1812|:1813'
```

WireGuard must be up before this service can bind. It restarts if binding/DB startup fails. Expected listener addresses are `10.77.0.1`, NOT `0.0.0.0` or the public IP. Allow UDP 1812/1813 only from 10.77.0.2 on wg-babu through any existing host filters; do not broadly enable/change UFW or expose these ports publicly. Do not open a public RADIUS port at the provider.

`.env.radius` intentionally has live authentication enabled for commissioning even while the web/API retain the simulation banner. Do not serve paying customers during this staged state.

## 3. Install branded customer pages

Build on your checkout:

```sh
WIFI_BRAND="JIACHIE WIFI" pnpm hotspot:build
```

Optionally set `WIFI_SUPPORT_CONTACT` at build time. Pages are generated at `dist/hotspot/` and need no external assets/fonts. Changing the portal's brand later requires rebuilding/re-uploading these pages.

In WinBox Files, download a backup of the existing HotSpot folder. Upload the generated `login.html`, `flogin.html`, `status.html`, `logout.html`, `alogin.html` to that SAME directory, preserving its existing `md5.js` and other RouterOS files. If the directory is `flash/hotspot`, upload there and keep the matching profile html-directory. Do not reset HTML after uploading: that would overwrite the branded pages. The supplied pages use the confirmed customer gateway 10.78.0.1. A different deployment must adjust that address in `scripts/build-hotspot.ts` and the public web portal link.

Customers see the branded code-only page locally; the cloud `/portal` page directs customers onto shop Wi-Fi and to the local login. Voucher codes are never sent to a browser-supplied router URL or trusted based on query-string MAC addresses.

## 4. Configure the router (WinBox, while on management Wi-Fi)

First create the dedicated RADIUS user profile, ONCE:

```routeros
/ip hotspot user profile add name=babu-vouchers shared-users=1 add-mac-cookie=no
```

In **RADIUS → New**, set:

| Field | Value |
|---|---|
| Service | hotspot ONLY |
| Address | 10.77.0.1 |
| Src. Address | 10.77.0.2 |
| Authentication Port | 1812 |
| Accounting Port | 1813 |
| Timeout | 3 seconds |
| Secret | The new private value from .env.radius |
| Require Message Auth | yes-for-request-resp |

Do not enable the `login` service: staff/router management does not use voucher authentication. Do not weaken Message-Authenticator requirements to bypass a failed check. Check existing RADIUS entries so this service is selected for HotSpot.

Then:

```routeros
/ip hotspot profile set [find name="babu-hotspot-profile"] use-radius=yes radius-accounting=yes radius-interim-update=1m login-by=http-chap
/ip hotspot user disable [find name="babu-test"]
```

A matching local HotSpot username takes precedence over RADIUS. Do not create local users named after voucher codes. No router API write permission is needed; keep `babu-api-check` read-only.

Restrict MAC-based router administration and discovery to the existing management LAN list, after confirming it contains only `bridge`, not `babu-guest`:

```routeros
/tool mac-server set allowed-interface-list=LAN
/tool mac-server mac-winbox set allowed-interface-list=LAN
/ip neighbor discovery-settings set discover-interface-list=LAN
```

The IPv4 firewall does not provide wireless client-to-client isolation within the EAP. Enable client isolation on both EAP SSIDs and protect EAP management before public launch. Keep IPv6 unavailable on the guest segment (no RA/DHCPv6/global forwarding) unless separately filtered; RouterOS HotSpot authorizes IPv4. Verify private addresses 192.168.88.1, 192.168.100.1 and 10.77.0.1 are unreachable from the customer device.

## 5. Commission using a NEW sold voucher

Use an explicitly labelled commissioning package/batch and your established cash-sale workflow. Sales remain real records; do not silently delete test receipts or reverse an activated sale.

1. Prepare a short package (e.g. 2 minutes) with 5 Mbps down / 2 Mbps up. Generate fresh stock. An unsold code must fail and must not create an access grant.
2. Record a sale, then use that code on the branded Wi-Fi page with mobile data OFF. Verify it gets internet, an ACTIVE grant and one fixed expiry in Access Grants.
3. In WinBox check `/ip hotspot active print` and `/queue simple print`; confirm the correct user, remaining time and rates. Run a phone speed test.
4. Disconnect after part of the allowance. Reconnect with the same code/device. Remaining time must decrease, never reset. A second MAC must be rejected.
5. Wait beyond the ORIGINAL expiry. Existing browsing must stop, and the code must fail permanently even after logout/reconnect or a router reboot. A new sold code should work.
6. Stop RADIUS briefly: new logins must fail closed; an existing session must still end at its previously issued timeout. Restart and confirm expired codes stay rejected.
7. Enable live mode for API/web below, then open **Wi-Fi Sessions**. Start/interim/stop packets should appear, with upload/download totals increasing about once per minute. Do not infer an active connection from a stale report.
8. Confirm customer isolation and branded login on both 2.4 GHz and 5 GHz.

If authentication fails, inspect `/radius monitor [find service=hotspot]` (or select the entry in WinBox) for timeouts, rejects and bad replies; do not print the secret. Timeout: inspect WireGuard, host listeners and service DB reachability. Bad replies: check the exact secret and Message-Authenticator. Reject: check code state, prior activation, MAC, expiry and CHAP login. The service intentionally does not log codes/passwords or send detailed voucher-state errors to customers.

## 6. Enable the deployed portal

After the radius service/migration/router setup are ready, set these in `.env.api`:

```dotenv
NETWORK_PROVIDER=mikrotik
OMADA_MODE=live
MIKROTIK_RADIUS_ENABLED=true
```

Set `.env.web` to `NETWORK_PROVIDER=mikrotik`, `OMADA_MODE=live`, `WIFI_BRAND="JIACHIE WIFI"`. Preserve APP_ORIGIN/ORIGIN=https://jiachie-wifi.com and all existing secrets. Rebuild/recreate api, worker and web with the existing Compose stack (`up -d --build --no-deps api worker web`). Leave Caddy alone. Keep radius running with `.env.radius`.

The staff portal reads its mode from the authenticated API `/runtime` endpoint. The web environment alone cannot switch the badge to live. Deploy API and web together for this release. A separately running RADIUS service can authenticate vouchers while the portal API is still in test mode; the banner does not disable that service. “Live mode” describes configuration, and “Router reachable” describes the last read-only check. Neither is a claim that expiry or hardware commissioning passed.

For refreshed customer branding, rebuild `WIFI_BRAND="JIACHIE WIFI" pnpm hotspot:build` and replace only the five generated HTML files **inside the router’s `hotspot/` directory**, preserving `md5.js`, `api.json`, and other router files. These pages use inline styles/icons with no external dependencies. Login accepts codes with or without hyphens. The compact layouts fit ordinary phone screens; smaller viewports, keyboards or enlarged text may still scroll so content is never clipped.

The legacy variable name OMADA_MODE remains for compatibility; it selects mock/live for the chosen NETWORK_PROVIDER. The worker no longer dispatches Omada-style authorization for live MikroTik. Browser calls to the old redemption endpoint are rejected in MikroTik live mode.

## What the portal tracks (and limits)

Sales, stock, immutable voucher terms, device binding, activation and permanent expiry stay in the existing portal. **Wi-Fi Sessions** adds router-reported session start/last update/stop, duration and cumulative uploaded/downloaded bytes. Counters survive duplicate/out-of-order reports without double-counting. Reports are not a browser history and do not claim to identify websites visited. Router reboot/outage can lose accounting packets; after three minutes without a report the UI says STALE rather than claiming online. Old records have no retroactive traffic data.

Revoking a grant rejects future logins. This release does NOT implement an immediate RADIUS Disconnect-Message: an existing session may continue until its issued deadline. For immediate operator intervention remove the matching session in WinBox → IP → Hotspot → Active, and keep its grant revoked. A session timer, not the accounting worker, enforces automatic expiry.

Rollback: stop the radius service, set use-radius=no on the HotSpot profile and restore portal mock mode; leave guest drop rules and no local fallback users. Existing authenticated sessions continue to their issued deadline unless removed manually. Do not drop the additive migration or restore voucher keys to older values. Do not present simulation mode alone as a way of stopping the separately running RADIUS service.
