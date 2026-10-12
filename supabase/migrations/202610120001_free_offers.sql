-- Free Wi-Fi offers: a stretch of time, set by the shop, in which anyone on the
-- shop Wi-Fi can go online with one tap on the sign-in page.
--
-- An offer is a window, not an allowance per phone. Phones can change the
-- address the Wi-Fi sees, so "once per device" cannot be enforced honestly;
-- "free for everyone between these dates, optionally only between these hours
-- each day" can. When the window closes, sessions end with it.
--
-- The RADIUS server reads this table on every free sign-in and writes one row
-- to free_offer_logins, which is how the portal counts who used the offer.

create table wifi.free_offers(
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references wifi.sites(id),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  daily_start time,
  daily_end time,
  download_mbps integer not null check (download_mbps between 1 and 10000),
  upload_mbps integer not null check (upload_mbps between 1 and 10000),
  enabled boolean not null default true,
  created_by uuid references wifi.staff_profiles,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check ((daily_start is null) = (daily_end is null)),
  check (daily_start is null or daily_start <> daily_end)
);
create index free_offers_live on wifi.free_offers(site_id, ends_at) where enabled;

create table wifi.free_offer_logins(
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references wifi.free_offers(id),
  client_mac text not null check (client_mac ~ '^[0-9A-F]{2}(:[0-9A-F]{2}){5}$'),
  created_at timestamptz not null default now()
);
create index free_offer_logins_offer on wifi.free_offer_logins(offer_id, created_at);

alter table wifi.free_offers enable row level security;
revoke all on wifi.free_offers from public, anon, authenticated;
grant select, insert, update on wifi.free_offers to babu_runtime;
create policy runtime_access on wifi.free_offers to babu_runtime using (true) with check (true);

alter table wifi.free_offer_logins enable row level security;
revoke all on wifi.free_offer_logins from public, anon, authenticated;
grant select, insert on wifi.free_offer_logins to babu_runtime;
create policy runtime_access on wifi.free_offer_logins to babu_runtime using (true) with check (true);
