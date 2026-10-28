-- Dedicated outbox. Does not change any existing Wi-Fi payment tables/routes.
begin;
create table if not exists wifi.music_payment_relay_outbox (
 event_id text primary key check(event_id ~ '^[a-f0-9]{64}$'),
 payload jsonb not null,
 attempts integer not null default 0,
 created_at timestamptz not null default now(),
 next_attempt_at timestamptz not null default now(),
 locked_until timestamptz,
 delivered_at timestamptz,
 last_http_status integer
);
create index if not exists music_payment_relay_pending on wifi.music_payment_relay_outbox(next_attempt_at) where delivered_at is null;
alter table wifi.music_payment_relay_outbox enable row level security;
revoke all on wifi.music_payment_relay_outbox from public,anon,authenticated;
grant select,insert,update on wifi.music_payment_relay_outbox to babu_runtime;
-- babu_runtime is the existing restricted backend DB role, not an app user.
drop policy if exists music_relay_runtime on wifi.music_payment_relay_outbox;
create policy music_relay_runtime on wifi.music_payment_relay_outbox to babu_runtime using(true) with check(true);
commit;
