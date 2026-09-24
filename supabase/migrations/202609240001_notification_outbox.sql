-- Emails about sales, queued in the same transaction as the sale itself and
-- delivered afterwards by the worker.
--
-- Queued rather than sent inline for three reasons. An email must never be
-- able to slow or fail a payment callback. A mail-provider outage must not lose
-- the message, only delay it. And a provider that retries its callback must not
-- produce a second email: the unique (kind, dedupe_key) makes the second insert
-- a no-op.
--
-- No voucher code is ever written here. The payload holds what the owner needs
-- to recognise the sale, not what a customer needs to use it.

create table wifi.notification_outbox(
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('SALE_PAID')),
  dedupe_key text not null,
  recipients text[] not null check (cardinality(recipients) between 1 and 10),
  payload jsonb not null,
  status text not null default 'PENDING' check (status in ('PENDING','SENT','FAILED')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  provider_message_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (kind, dedupe_key)
);
create index notification_outbox_due on wifi.notification_outbox(next_attempt_at) where status = 'PENDING';

alter table wifi.notification_outbox enable row level security;
revoke all on wifi.notification_outbox from public, anon, authenticated;
grant select, insert, update on wifi.notification_outbox to babu_runtime;
create policy runtime_access on wifi.notification_outbox to babu_runtime using (true) with check (true);
