# BABU-SHOP WIFI — VPS and hardware launch

Prepared for: 150 Mbps fibre, MikroTik L009, TP-Link EAP225-Outdoor.

## Current readiness — do not skip this

The application, sales workflow, duration editor, copy buttons, immutable package speed snapshots and read-only MikroTik connection check are prepared. The network remains simulated. **MikroTik voucher authorization is not implemented or commissioned yet.** Changing an environment flag cannot make it live: startup deliberately rejects MikroTik live mode. The existing authorization implementation targets Omada external portals, which is a different protocol.

Tomorrow requires completing the MikroTik access integration and passing the acceptance tests below before taking payment for real internet. An overnight preparation cannot verify boxed hardware. Never interpret a successful REST connection check as a live-access test.

## Deployment layout

```text
Customer phone → EAP225 (bridge/AP) → L009 HotSpot → fibre internet
                      L009 → outbound WireGuard tunnel → VPS
Browser → HTTPS portal on VPS → API / worker → Supabase
```

No Omada controller is required for this topology. MikroTik must see each customer's MAC/IP; do not put another NAT router between the EAP and HotSpot.

Use an always-on Linux VPS with Docker Compose, a public domain pointed at it, and a private WireGuard link to the router. The laptop development server at 127.0.0.1:5188 is not a public deployment.

Required values: VPS public IP, portal domain, administrator SSH access, Supabase connection, actual fibre upload rate, router firmware version. Do not put secrets into chat or Git.

## Tonight: prepare the VPS

1. Provision a supported Linux VPS and SSH key access. Enable a host firewall: permit SSH only from administrator addresses, public TCP 80/443 for the portal and UDP 51820 for WireGuard. Do not expose API port 4000, database ports or RouterOS management to the internet.
2. Install Docker Engine, Compose and WireGuard using the OS/vendor instructions. Copy this repository without `.env`, `.babu-backup`, `node_modules` or development artifacts. Supply production secrets separately with file permissions 600.
3. Point a domain's DNS at the VPS. Set `APP_DOMAIN` to that hostname, `APP_ORIGIN=https://HOSTNAME`, and keep `OMADA_MODE=mock` until the MikroTik access path exists and has passed commissioning. `OMADA_MODE` is a legacy variable retained by this preparation release; it is not an instruction to buy Omada hardware.
4. Create `.env.web` and `.env.api` from `infra/deployment/web.env.template` and `api.env.template`. Web must not get database, voucher encryption, service-role or router secrets. API/worker get only the restricted runtime database login, not DATABASE_ADMIN_URL or SUPABASE_SECRET_KEY. Preserve the existing voucher keys if using the existing database; rotating them breaks existing codes.
5. Apply committed migrations separately using the privileged migration CLI. Use a secure temporary environment and remove it from the deployment after use. Keep the database timezone behavior unchanged.
6. Run `docker compose config --quiet`, `docker compose up -d --build`, then check `docker compose ps` and the `/login` and `/portal` pages via HTTPS. Configure Supabase Site URL/allowed redirects for the actual domain; disable public signup. Verify staff login. Change the temporary admin password before sales begin.
7. WireGuard: create separate private/public key pairs on the VPS and router; never reuse or commit private keys. Use the supplied `infra/mikrotik/wg0.conf.template`. Choose a non-overlapping subnet; example addresses are VPS `10.77.0.1/30` and L009 `10.77.0.2/30`. Do not send customer internet traffic through the VPS. The tunnel is only for management/API. Check that Docker outbound routing to `10.77.0.2` works and limit its forwarding to the expected app containers; do not open general guest-to-management forwarding.

## Tomorrow: unbox and configure

1. Connect a staff laptop directly to L009 and use WinBox. Record exact model/RouterOS version. Back up factory/current configuration and use Safe Mode for network changes. Install a suitable stable RouterOS 7 release after reviewing its notes. Do not reset/import a generic script over an unknown configuration.
2. Fibre/ISP router goes to the chosen L009 WAN port (usually ether1). Confirm whether the ISP supplies DHCP, PPPoE or a static address; keep ISP credentials private. Run a wired download/upload test. Set WAN_UPLOAD_MBPS from verified capacity. 150 Mbps is aggregate download capacity, not a promise to every client.
3. Use the EAP225's supplied PoE injector: L009 customer LAN → injector LAN, injector PoE → EAP225. Check the supplied injector/device labels; do not assume the L009 supplies compatible PoE power. Configure SSID `BABU-SHOP WIFI`, AP/bridge operation and a strong management password. Enable wireless client isolation as supported. Keep EAP management reachable only by staff.
4. Separate customer and management networks. Proposed customer subnet `10.20.0.0/24`, gateway `10.20.0.1`; verify no overlap first. Keep a wired management recovery port. Configure DHCP, DNS, NAT and HotSpot `babu-hotspot` on the customer interface only. Use MikroTik's HotSpot setup wizard after reviewing its generated rules. Do not add WAN to the customer bridge.
5. Deny customer access to staff LAN, router management, private VPN and other guests. Address IPv6 explicitly: RouterOS HotSpot is IPv4-based, so the customer network must not have an unauthenticated IPv6 internet path. Check FastTrack exclusions because HotSpot and speed queues must not be bypassed. No trial/MAC/cookie login that bypasses the portal's sale, binding and expiry policy.
6. Establish WireGuard: L009 peer endpoint is the VPS IP:51820, allowed address `10.77.0.1/32`, persistent keepalive 25s. VPS peer allowed address is `10.77.0.2/32`. Permit only intended private management traffic.
7. Set up RouterOS HTTPS with a certificate trusted by the VPS, whose SAN matches MIKROTIK_BASE_URL. Restrict the service and dedicated account to the VPS tunnel address. For the read-only check, use a dedicated group with the required `read,rest-api` permissions; do not grant full admin to the app. Confirm actual required permissions on your RouterOS version. Create `infra/secrets/mikrotik-ca.crt` (readable by the container’s node user) and start with `docker compose -f docker-compose.yml -f docker-compose.mikrotik.yml up -d --build` to mount the CA. Never disable TLS verification.
8. Set the private `MIKROTIK_BASE_URL`, username/password, CA path and hotspot server in `.env.api`. Run `pnpm network:check` from a secured environment or use **Network setup → Check MikroTik connection**. This reads system/resource and ip/hotspot only.

## Remaining implementation before go-live

Implement and test a MikroTik-specific customer login/authentication flow against the installed version. Use the documented HotSpot external-login flow or a private RADIUS integration; do not invent an `/active/login` endpoint. Replace Omada AP redirect assumptions with validated MikroTik context. Verify MAC/IP against the router, never trust URL parameters alone. Keep unsold vouchers unusable.

Enforce absolute expiry on the network: a week means seven days from first activation including offline time. RouterOS `limit-uptime` alone is cumulative connected time and is insufficient. Reconnects must use remaining entitlement, not restart the clock. The selected design must reject expired authentication after a router reboot and cut off sessions without relying solely on a reachable VPS worker. Handle timeout/ambiguous authorization without double granting. Implement network disconnect/revocation before claiming that an admin revoke immediately disconnects a user.

Map saved download/upload limits correctly: RouterOS rx is customer upload; tx is customer download. New voucher snapshots preserve these values even if a package later changes. Old vouchers remain time-only; do not backfill sold terms. Packages are “up to” speeds, with total download bounded by the shared line. Configure a parent/fairness policy based on measured upload and download, and verify FastTrack does not bypass it.

Configure the real HTTPS portal and minimal walled-garden dependencies. Supabase staff auth should not be needed for customer login. Check DNS and portal assets from an unauthenticated phone. Keep all app/API/router secrets server-side.

## Acceptance — all must pass before real sales

- Unauthenticated phone sees the portal and cannot browse around it (IPv4 and IPv6 checked).
- Unsold, void and invalid vouchers fail. Sold voucher connects only its first bound device.
- Short test package disconnects at its absolute deadline while actively browsing.
- Disconnect/reconnect does not extend expiry. A second device cannot reuse the code.
- VPS/tunnel outage and router reboot do not extend entitlement or permit expired re-login.
- Download/upload speed tests match the package; two clients share the line as intended.
- Cash sale, receipt, copying and customer handover work; no simulation banner remains after a genuine live implementation is enabled.
- Customer cannot reach router admin, staff LAN, private VPN or other customers.
- Revoke and recovery behavior are accurately displayed and verified on the router.
- Backups, restart recovery and a staff recovery connection are tested.

Until those pass, use test vouchers and keep the system in preparation mode. Do not promise a guaranteed launch time before testing the physical equipment.

## Official references

- https://help.mikrotik.com/docs/spaces/ROS/pages/47579162/REST+API
- https://help.mikrotik.com/docs/spaces/ROS/pages/56459266/HotSpot+-+Captive+portal
- https://manual.mikrotik.com/docs/authentication-authorization-accounting/hotspot-captive-portal/hotspot-customisation/
- https://manual.mikrotik.com/docs/virtual-private-networks/wireguard/
