-- VIP devices: phones the shop lets online free, with no sign-in. Each enabled
-- row is mirrored on the router as a hotspot IP binding of type "bypassed",
-- tagged with the row's id. The router is the enforcement; this table is the
-- list the portal keeps it in step with, and the record of who added what.

create table wifi.vip_devices(
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references wifi.sites(id),
  mac text not null check (mac ~ '^[0-9A-F]{2}(:[0-9A-F]{2}){5}$'),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  note text check (note is null or char_length(note) <= 200),
  enabled boolean not null default true,
  router_binding_id text,
  synced_at timestamptz,
  sync_error text,
  created_by uuid references wifi.staff_profiles,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, mac)
);

alter table wifi.vip_devices enable row level security;
revoke all on wifi.vip_devices from public, anon, authenticated;
grant select, insert, update, delete on wifi.vip_devices to babu_runtime;
create policy runtime_access on wifi.vip_devices to babu_runtime using (true) with check (true);
