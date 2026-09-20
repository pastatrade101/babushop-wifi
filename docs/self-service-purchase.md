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

## The voucher code is never in a URL

The buyer's browser holds an opaque **claim token**; only its HMAC digest is
stored. The code is returned over `POST /api/v1/portal/purchase/status`, once,
after the intent is `PAID`. Nothing about the code travels in a query string, a
redirect, an email or the webhook. The token lives in `sessionStorage`, so
reopening the page in a different browser cannot retrieve someone else's code —
the screen says so and directs them to the attendant.

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

### 3. Open the walled garden on the router

A customer on the shop Wi-Fi has no internet until they authenticate, so the
hotspot must let the purchase and payment pages through **before** login.
Keep this list minimal — it is not a general internet allowance.

```routeros
/ip hotspot walled-garden add dst-host=jiachie-wifi.com comment="JIACHIE buy page"
/ip hotspot walled-garden add dst-host=*.snippe.sh comment="JIACHIE payment checkout"
```

Add the hosts your mobile-money provider redirects to as well — watch a real
purchase and add what it actually reaches, rather than guessing. If a buyer
reports a blank page mid-payment, a missing walled-garden host is the first
thing to check.

Customers who have their own mobile data can buy without any of this; the walled
garden is what makes it work for those who do not.

### 4. Test with a real, cheap package before going live

Create a genuinely cheap package (Snippe's floor is 500 TZS), buy it end to end
on a phone, and confirm: the code appears, it connects, and the sale shows in
the staff Sales list as `MOBILE`/`SELF_SERVICE`. Then check a *failed* payment
returns the voucher to stock.

## What is deliberately not built

- **No refund automation.** `REFUND_DUE` is a flag for a human. Refunds happen in
  the provider's dashboard, by a person who can see the money.
- **No subscriptions.** The provider interface is ready for them; nothing in the
  voucher path assumes one-off purchase.
- **No SMS delivery.** The code is shown on screen only.
- **No stored customer identity.** An optional phone number is forwarded to the
  provider so the buyer recognises the charge. No account is created.
