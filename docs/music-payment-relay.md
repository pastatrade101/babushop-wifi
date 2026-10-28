# Pastatrade Music trusted relay

The existing `pastory` callback URL remains unchanged. Wi-Fi and other callback
routes remain unchanged. Music orders use `PTM-<uuid>` and are intercepted BEFORE
generic payment-event deduplication; only authenticated AzamPay callbacks enter
`wifi.music_payment_relay_outbox`. Its worker delivers signed envelopes to Music.

## Deployment (not performed automatically)

1. Apply `supabase/migrations/202610270001_music_payment_relay.sql` to THIS
   project's database, with normal migration/admin credentials.
2. Keep the existing AzamPay credentials and `AZAM_SOURCE=pastory` in the same
   server `.env.api`. RSA mode requires `AZAM_CALLBACK_PUBLIC_KEY`. For the
   existing partner select `MUSIC_RELAY_UPSTREAM_AUTH=callback-token`, requiring
   the existing 64-hex-character callback token and explicit unsigned allowance.
   The unsigned allowance alone is not sufficient. This trusts the partner's
   secret HTTPS callback URL, not an independently verified AzamPay signature.
   Callback path secrets are redacted from API request logs.
   Actual callbacks omit currency; pin `MUSIC_RELAY_SETTLEMENT_CURRENCY=TZS`
   for this TZS-only gateway. Explicit currencies are never overwritten.
3. Generate a NEW random 32-byte hex secret in the server's secret manager and
   set the identical `MUSIC_RELAY_SECRET` on MikroTik and Music, server-only.
   Never use an AzamPay credential or ship this secret in an APK.
4. Set `MUSIC_RELAY_URL=https://music.makutano.co.tz/api/billing/relay` and
   `MUSIC_RELAY_ENABLED=true` on BOTH API and worker; restart both only after
   the Music receiver/database are deployed. No generic forwarding rule needed.
5. Test an authenticated callback whose `utilityref` / `externalreference`
   contain the original PTM order reference and the stored provider reference.
   If the actual partner payload differs, keep checkout disabled and inspect
   a redacted sample; do not switch to unsigned metadata for attribution.

The callback route returns success only after the outbox insert commits. The
worker leases rows for 45 seconds, uses an 8-second request timeout, and retries
with exponential backoff capped at one hour. It never silently abandons events.
Each retry gets a fresh timestamp/HMAC; only a matching `received` event ID from
Music acknowledges delivery. An isolated async lane avoids blocking Wi-Fi work.
Redirects are refused. Payloads contain payment references, not phone numbers,
upstream signatures, tokens, email addresses or account credentials.

Monitor `delivered_at is null` (especially attempts >= 5 or age > 5 minutes),
`last_http_status`, and the Music review ledger. Delivered rows can be archived
after the business retention period; do not delete pending rows. Sender and
receiver hosts require synchronized clocks (five-minute authentication window).
Previously failed legacy forwarding is NOT automatically migrated/replayed.

Missing authentication/routing/DB configuration fails closed. No payments or
production deployment are performed by adding these source files.
