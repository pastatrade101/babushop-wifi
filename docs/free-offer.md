# Free Wi-Fi offer

A free offer is a stretch of time, set by the shop, in which **anyone** on the shop
Wi-Fi can go online with one tap on the sign-in page that pops up on their phone.
Outside that time the page shows only the voucher box and **Nunua vocha**.

It is a time window, not an allowance per phone. Phones can change the address the
Wi-Fi sees (MAC randomisation), so "once per device" cannot be enforced honestly.
"Free for everyone during these dates, optionally only between these hours each
day" can.

## Setting one up

Portal › **Selling › Free offer** (administrators only).

| Field | Meaning |
|---|---|
| Name customers see | Shown on the sign-in page, e.g. "Wi-Fi bure wiki ya uzinduzi". |
| Starts, Ends | Tanzanian time. The offer is on from Starts until Ends. |
| Only between these hours each day | Optional. Then it is on only between From and To each day, inside Starts–Ends. Hours may cross midnight (22:00 to 02:00). |
| Download / upload speed | The free speed. A slower free speed leaves a reason to buy. |
| Switched on | Off hides the offer at once. |

The list shows each offer's state (on now, scheduled, ended, switched off), when the
current free time ends or the next one starts, and how many devices and free
sign-ins it has had.

## What a customer sees

1. They join the Wi-Fi and the phone opens the sign-in page.
2. The page asks `https://jiachie-wifi.com/api/v1/portal/offer` whether an offer is on.
   The router lets this through before sign-in (walled garden list `jiachie-purchase`).
3. If one is on, a card at the top shows its name, "Wi-Fi bure kwa kila mtu hadi
   17:00" and **Ingia bure sasa**. If the server cannot be reached, or nothing is on,
   the page is exactly the normal sign-in page.
4. The button signs in under a free name of its own (`OFA-BURE-` and 12 random letters), because the router allows one session per name. Their session ends when the
   offer's current free time ends. While the offer is still on they can sign in free
   again; after it ends the page offers only packages and vouchers.

The sign-in page must be the current one: after deploying this feature, press
**Router › Files › Publish branded pages** once.

## How it works

- `packages/network/src/offer.ts`: the rules, shared by the RADIUS server, the API
  and the tests. Tanzania is UTC+3 all year, so local time is a fixed shift.
- `packages/database/src/radius-access.ts`: a RADIUS request for an `OFA-BURE-…` name is decided
  before any voucher lookup. It checks the CHAP answer (the password is the name itself), picks
  the running offer whose free time lasts longest, records the device in
  `wifi.free_offer_logins`, and accepts with `Session-Timeout` up to the end of that
  free time (less 5 seconds) and the offer's speed. Outside every offer it rejects.
- Accounting for `OFA-BURE-…` sessions is acknowledged and not stored; voucher sessions
  are recorded as before.
- `apps/api`: `GET /api/v1/portal/offer` (public, readable from any origin, only the
  name and end time), `GET/POST /api/v1/offers` and `PATCH /api/v1/offers/:id` (admin).
- Tables: `wifi.free_offers`, `wifi.free_offer_logins`
  (`supabase/migrations/202610120001_free_offers.sql`). Creating and editing offers is
  audited as `FREE_OFFER_CREATED` / `FREE_OFFER_UPDATED`.

## Deploying

The decision is made by the RADIUS server, so the `radius` container is rebuilt
once. New sign-ins pause for about 15 seconds while it restarts; people already
online stay online.

```bash
pnpm db:migrate:direct
# on the server, in ~/app/services/babushop-wifi
docker compose -f docker-compose.makutano.yml build && docker compose -f docker-compose.makutano.yml up -d
docker compose -f docker-compose.makutano.yml -f docker-compose.radius.yml build radius
docker compose -f docker-compose.makutano.yml -f docker-compose.radius.yml up -d --no-deps radius
docker logs --tail 5 babushop-wifi-radius-1   # "MikroTik RADIUS listening on private UDP 1812/1813"
```

Then publish the sign-in pages from the portal.

## Checking it

- With no offer on, `curl -s https://jiachie-wifi.com/api/v1/portal/offer` returns
  `{"active":false,...}` and the sign-in page has no card.
- Create an offer that starts now and ends in an hour. The endpoint returns its name,
  the card appears on a phone joining the Wi-Fi, and **Ingia bure sasa** gets it
  online. Switch the offer off: the card disappears for the next person.
- A voucher still works exactly as before.
