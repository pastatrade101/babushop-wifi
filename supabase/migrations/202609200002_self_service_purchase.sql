-- Self-service mobile-money voucher purchase, alongside the existing cash counter.
-- Additive: every existing row stays COUNTER/CASH with its cashier, and the cash
-- flow is unchanged. A voucher is still only marked SOLD inside the sale
-- transaction, which now runs when the provider confirms payment rather than
-- when a cashier takes notes -- so an abandoned checkout never burns stock.

-- A self-service reservation has no cashier. Keep the actor rules explicit so a
-- counter sale can never lose its cashier and a self-service one can never gain
-- a fake staff id.
alter table wifi.sale_reservations alter column staff_id drop not null;
alter table wifi.sale_reservations add column channel text not null default 'COUNTER'
  check (channel in ('COUNTER','SELF_SERVICE'));
alter table wifi.sale_reservations add constraint reservation_actor check (
  (channel = 'COUNTER' and staff_id is not null) or
  (channel = 'SELF_SERVICE' and staff_id is null));

alter table wifi.manual_sales alter column cashier_id drop not null;
-- The payment_method check is auto-named; drop whichever name this database has.
do $$ declare existing text; begin
  select conname into existing from pg_constraint
   where conrelid = 'wifi.manual_sales'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) like '%payment_method%';
  if existing is not null then
    execute format('alter table wifi.manual_sales drop constraint %I', existing);
  end if;
end $$;
alter table wifi.manual_sales add column channel text not null default 'COUNTER'
  check (channel in ('COUNTER','SELF_SERVICE'));
alter table wifi.manual_sales add constraint sale_actor check (
  (channel = 'COUNTER' and cashier_id is not null and payment_method = 'CASH') or
  (channel = 'SELF_SERVICE' and cashier_id is null and payment_method = 'MOBILE'));

-- One intent per checkout attempt. The voucher code is never stored here and
-- never travels in a URL: the buyer holds a claim token whose HMAC digest is
-- stored, and exchanges it for the code over POST once the intent is PAID.
create table wifi.payment_intents (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references wifi.sites,
  package_id uuid not null references wifi.packages,
  reservation_id uuid unique references wifi.sale_reservations,
  sale_id uuid unique references wifi.manual_sales,
  provider text not null,
  -- Our reference, sent to the provider. `provider_reference` is whatever it
  -- hands back: a webhook may quote either, so both are matched on lookup.
  reference text not null,
  provider_reference text,
  status text not null default 'PENDING'
    check (status in ('PENDING','PAID','FAILED','EXPIRED','REFUND_DUE')),
  amount_tzs integer not null check (amount_tzs > 0),
  currency text not null default 'TZS' check (currency = 'TZS'),
  customer_phone text,
  claim_digest text not null unique,
  checkout_url text,
  expires_at timestamptz not null,
  paid_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, reference)
);
create index payment_intents_open on wifi.payment_intents (status, expires_at);
create index payment_intents_provider_ref on wifi.payment_intents (provider_reference)
  where provider_reference is not null;

-- Raw provider callbacks, kept for audit. The unique (provider,event_id) is the
-- idempotency guard: a retried webhook inserts nothing and grants nothing twice.
create table wifi.payment_events (
  id uuid primary key default gen_random_uuid(),
  intent_id uuid references wifi.payment_intents on delete set null,
  provider text not null,
  event_id text not null,
  event_type text not null,
  status text,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (provider, event_id)
);
create index payment_events_intent on wifi.payment_events (intent_id, created_at desc);

-- A paid intent is terminal: it must carry its money trail and never be reopened.
create function wifi.protect_intent() returns trigger language plpgsql as $$ begin
  if old.status = 'PAID' and new.status <> 'PAID' then
    raise exception 'A paid purchase cannot be reopened';
  end if;
  -- What was bought, for how much, and who may claim it can never change.
  -- provider_reference is deliberately excluded: it is filled in once the
  -- provider answers, after the row already exists.
  if row(new.package_id, new.amount_tzs, new.claim_digest, new.reference)
     is distinct from row(old.package_id, old.amount_tzs, old.claim_digest, old.reference) then
    raise exception 'Purchase terms are immutable';
  end if;
  return new;
end $$;
create trigger protect_intent before update on wifi.payment_intents
  for each row execute function wifi.protect_intent();

alter table wifi.payment_intents enable row level security;
alter table wifi.payment_events enable row level security;
revoke all on wifi.payment_intents, wifi.payment_events from public, anon, authenticated;
grant select, insert, update on wifi.payment_intents to babu_runtime;
grant select, insert on wifi.payment_events to babu_runtime;
create policy runtime_access on wifi.payment_intents to babu_runtime using (true) with check (true);
create policy runtime_access on wifi.payment_events to babu_runtime using (true) with check (true);
