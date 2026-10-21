-- Data used on free Wi-Fi offers.
--
-- RADIUS accounting already reports every hotspot session's bytes, but only
-- voucher sessions were kept (network_sessions hangs off a voucher's grant). A
-- free sign-in has no voucher, so its reports were dropped and the portal could
-- say how many phones used an offer but not how much they used.
--
-- Each free sign-in now records the name it signed in with (OFA-BURE-<random>,
-- one per phone), and accounting for that name lands here, against the offer
-- that let it on. Counters are absolute, as for vouchers: a duplicate or late
-- report can never double-count or reopen a session.

alter table wifi.free_offer_logins
  add column username text check (username ~ '^OFA-BURE-[a-z0-9]{8,16}$');
create index free_offer_logins_user on wifi.free_offer_logins(username, client_mac, created_at desc);

create table wifi.free_offer_sessions(
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references wifi.free_offers(id),
  client_mac text not null check (client_mac ~ '^[0-9A-F]{2}(:[0-9A-F]{2}){5}$'),
  username text not null check (username ~ '^OFA-BURE-[a-z0-9]{8,16}$'),
  nas text not null,
  session_id text not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  stopped_at timestamptz,
  terminate_cause text,
  session_seconds bigint not null default 0 check (session_seconds >= 0),
  upload_bytes numeric(20,0) not null default 0 check (upload_bytes >= 0),
  download_bytes numeric(20,0) not null default 0 check (download_bytes >= 0),
  -- RouterOS numbers sessions per boot, so an id can come round again. With the
  -- phone and its sign-in name in the key, another phone's session that reuses
  -- an old id gets its own row instead of being dropped against the old one.
  unique (nas, session_id, username, client_mac)
);
create index free_offer_sessions_offer on wifi.free_offer_sessions(offer_id, client_mac);

alter table wifi.free_offer_sessions enable row level security;
revoke all on wifi.free_offer_sessions from public, anon, authenticated;
grant select, insert, update on wifi.free_offer_sessions to babu_runtime;
create policy runtime_access on wifi.free_offer_sessions to babu_runtime using (true) with check (true);
