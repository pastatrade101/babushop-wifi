# Self-service voucher purchase (mobile money)

Customers buy a voucher with mobile money instead of paying the attendant. **The
cash counter is unchanged** — same screens, same receipts, same reversal rules.
The two channels share one pool of voucher stock.

Payment runs through [Snippe](https://docs.snippe.sh) hosted checkout, so this
service never sees a card number or a mobile-money PIN. The gateway is
provider-agnostic (`packages/payments/src/provider.ts`): adding another provider
means implementing that interface, not touching voucher logic.

## Off by default

Blank `SNIPPE_API_KEY` or `SNIPPE_WEBHOOK_SECRET` disables the whole feature.
`/buy` then says mobile payment is unavailable and points at the attendant.
Nothing else changes. **This is the correct state until you have tested a real
purchase**, because a broken payment path takes money without issuing a voucher.

## How it protects stock and money

| Moment | What happens |
|---|---|
| Buyer picks a package | One voucher is **reserved** for 15 minutes. Not sold. |
| Buyer pays | Provider POSTs a signed webhook. |
| Webhook verified | Voucher marked `SOLD`, sale row written, intent `PAID` — one transaction. |
| Buyer abandons | Reservation lapses, voucher returns to stock. Nothing was sold. |
| Webhook lost | The status page asks the provider directly and settles from that. |
| Paid but hold lapsed | Intent becomes `REFUND_DUE`; the screen tells the buyer to see the attendant. |

A voucher is never marked `SOLD` before payment confirms. That ordering is
deliberate: the inventory trigger forbids `SOLD → AVAILABLE`, so selling on
optimism would permanently burn stock on every abandoned checkout.

Webhook replays are idempotent — `payment_events` has `unique (provider,
event_id)`, and a duplicate event inserts nothing and issues nothing.

## Automatic connection after confirmed payment

The buyer's browser holds an opaque **claim token**; only its HMAC digest is
stored. The code is returned over `POST /api/v1/portal/purchase/status` only
after the intent is `PAID`. The payment confirmation page then automatically
opens `http://10.78.0.1/login` with the voucher in the URL fragment (`#code=…`).
The existing router page clears that fragment, fills in the voucher and submits
the CHAP login. Customers staying on the shop Wi-Fi do not need to press Connect.
AzamPay checkout and callback verification are unchanged.

The fragment is not sent in HTTP requests, keeping the code out of query strings
and HTTP request logs. The waiting page checks until the server reports a final
payment state and checks immediately when the customer returns from the PIN
prompt. Pending, failed and refund-due payments never initiate a login.

On confirmed payment the page shows the voucher, a "write it down or copy it"
reminder and a 10-second countdown, then connects by itself -- no tap needed.
The pause matters: once the router page takes over, this page is gone, and the
hotspot has no auto-login cookie, so any later disconnect needs the code again.
It also gives a customer who is already connected on another voucher (whom the
router answers with "You're good to go" instead of logging in again) the chance
to keep the new code for when their current time ends.

The claim stays in `localStorage` after payment, so reopening `/buy/done` in the
same browser -- after the phone's sign-in window has closed, or in another tab --
shows the paid voucher again with a retry link. A per-tab marker in
`sessionStorage` stops a redirect loop. A different browser cannot retrieve the
code; the attendant can look up the paid sale and reveal it.

## Setup

### 1. Apply the migration

```sh
nvm use && corepack enable && pnpm db:migrate:direct
```

`202609200002_self_service_purchase.sql` is additive. Existing sales keep their
cashier and stay `COUNTER`/`CASH`; new columns default to exactly that.

### 2. Configure Snippe

In `.env.api` on the server (mode 600):

```dotenv
PUBLIC_API_URL=https://jiachie-wifi.com
SNIPPE_API_KEY=...
SNIPPE_WEBHOOK_SECRET=...
```

Register the webhook URL in the Snippe dashboard:

```
https://jiachie-wifi.com/api/v1/portal/payments/webhook/snippe
```

It is authenticated by HMAC over the raw request body with a five-minute replay
window — not by a staff token. Signature failures return 401 and issue nothing.

### 3. Allow purchases before Wi-Fi login

Customers can use the shop's internet to purchase even with no mobile data bundle.
The intended flow is **Wi-Fi sign-in → Buy a voucher → approve mobile money →
automatic Wi-Fi login**. The SIM still needs mobile-network signal
and sufficient mobile-money balance to approve the payment prompt. Keep the
purchase in the same browser/window until the voucher appears; changing browsers
loses the browser's claim token.

The old two HTTP host rules are insufficient for this installation:

- Hosted checkout is **`snippe.me`**, as shown in [Snippe's hosted checkout documentation](https://docs.snippe.sh/docs/2026-01-25/sessions/payment-links).
  `*.snippe.sh` does not match it. Inspection on 2026-09-20 found same-origin
  checkout scripts/fonts and Next.js server actions for payment submission and
  status on `snippe.me`. `api.snippe.sh` is called by our server, not directly by
  the customer's browser in the inspected flow.
- [HotSpot IP walled-garden entries](https://help.mikrotik.com/docs/spaces/ROS/pages/56459266/HotSpot+-+Captive+portal)
  exempt HTTPS from captive redirection, but the [dynamic filter rules return
  to the forward chain](https://help.mikrotik.com/docs/spaces/ROS/pages/87162881/Hotspot+customisation).
  Our existing `BABU commissioning block outbound` would still drop the request.

From **management Wi-Fi**, upload `infra/mikrotik/purchase-access.rsc` to the
router's Files root, then run in **WinBox → New Terminal**:

```routeros
/import file-name=purchase-access.rsc
```

The current script prints **JIACHIE purchase access v2** before doing anything.
If an earlier import said "Expected one BABU commissioning block outbound" even
though that rule is present and enabled, replace the uploaded script with this
revision. It looks up each comment separately, counts returned IDs by iteration,
and then validates enabled state, chain, action, interfaces and rule order with
`get`. It does not rely on a compound `find` expression or the length of an ID.
The original failed import stopped before changing any rules.

To avoid accidentally importing the old upload, save/upload this revision as
`purchase-access-v2.rsc`, then run `/import file-name=purchase-access-v2.rsc`.
Success also prints the purchase address list, HotSpot exception and forward
counter. Confirm resolved IPv4 entries appear below both DNS hostnames.

This script is specific to the existing `babu-guest` / `babu-hotspot` setup.
It checks the expected firewall anchors before adding anything. It creates a
DNS-backed `jiachie-purchase` address list for `jiachie-wifi.com` and `snippe.me`,
one TCP 443 HotSpot IP walled-garden rule, and one matching forward allow before
the guest outbound block. The private-network block stays before the allow;
the existing established/related WAN reply rule handles responses. Re-importing
does not add duplicates. It does not enable trial access, bypass devices, change
RADIUS, or remove the guest blocks.

These are **IP-and-port exceptions**, not URL-path restrictions: HTTPS on other
hostnames sharing an allowed address can also be reachable. Do not whitelist
entire CDN ranges or all TCP 443. Router DNS resolution and phone DNS need to
agree; use the DHCP-provided DNS during commissioning. Provider dependencies can
change, so a real unauthenticated-phone payment remains required.

Verify the new rules and resolved IPv4 entries:

```routeros
/ip firewall address-list print where list="jiachie-purchase"
/ip hotspot walled-garden ip print detail where comment="JIACHIE purchase HTTPS"
/ip firewall filter print stats where comment="JIACHIE purchase HTTPS before login"
```

If import stops with an error, send that error and `/ip firewall filter print`
before changing rule order. If checkout fails, identify the actual failed
hostname from browser requests. Add only a confirmed required host to the shared
address list; both exceptions then use it. Do not guess wildcards. The Snippe API
key and webhook secret remain on the server and are never needed on the router.

Rebuild the five branded HotSpot pages:

```sh
WIFI_BRAND="JIACHIE WIFI" pnpm hotspot:build
```

Replace `login.html`, `flogin.html`, `alogin.html`, `status.html` and `logout.html`
**inside `hotspot/`**, preserving `md5.js`, `api.json` and other RouterOS files.
The generated pages now include **Buy a voucher**, linking directly to
`https://jiachie-wifi.com/buy` in the same window. Uploading to Files root does
not replace `hotspot/login.html`. Rebuild/deploy the web service with your normal
Compose workflow for the cloud portal's buy link and the purchase-success
screen's automatic return to Wi-Fi; no new migration or payment credentials are needed.
The router's `login.html` must contain the `#code` fragment auto-submit handler
already included by `scripts/build-hotspot.ts`.

To undo only these exceptions (existing sessions may last until they close):

```routeros
/ip firewall filter remove [find comment="JIACHIE purchase HTTPS before login"]
/ip hotspot walled-garden ip remove [find comment="JIACHIE purchase HTTPS"]
/ip firewall address-list remove [find list="jiachie-purchase"]
```

### 4. Test with a real, cheap package before going live

Check the customer-facing package names, durations, prices and speeds first.
In particular, the reported WIKI PLUS duration of 47 minutes does not match its
weekly description; correct the package terms before selling it online. This
change does not modify the catalogue or existing voucher terms.

1. Use a phone with **mobile data OFF**, connected to customer Wi-Fi, with no
   active HotSpot session. Keep the SIM enabled for the mobile-money prompt.
2. Open `http://10.78.0.1/login`. The branded page and Buy a voucher link should
   load. Before paying, verify an unrelated site fails and staff/router private
   addresses remain unreachable. The OS may still say "No internet"; stay on
   Wi-Fi. If the captive mini-browser does not support payment, open `/buy` in
   the normal browser **before** starting the purchase and stay in that browser.
3. Confirm `https://jiachie-wifi.com/buy` and the Snippe checkout load fully.
   Choose a deliberately approved low-cost package (Snippe minimum 500 TZS)
   and complete one real mobile-money payment. Do not treat page loading as a
   successful payment test.
4. After confirmed payment, verify that the page shows the voucher for about
   10 seconds, then opens the router login and connects **without tapping
   Connect or entering a voucher**. Confirm the sale
   appears as `MOBILE` / `SELF_SERVICE`, then verify internet, speed and fixed
   expiry. If the router is unreachable, return to `/buy/done` in the same browser
   to recover the paid voucher and retry; do not pay again.
5. Abandon a separate unpaid checkout; confirm its reservation returns to stock
   after the 15-minute hold expires. Do not retry a charged purchase blindly if
   the code screen is lost; use the attendant's sales/payment records.

## What is deliberately not built

- **No refund automation.** `REFUND_DUE` is a flag for a human. Refunds happen in
  the provider's dashboard, by a person who can see the money.
- **No subscriptions.** The provider interface is ready for them; nothing in the
  voucher path assumes one-off purchase.
- **No SMS delivery.** The code is shown on screen only.
- **No stored customer identity.** An optional phone number is forwarded to the
  provider so the buyer recognises the charge. No account is created.
