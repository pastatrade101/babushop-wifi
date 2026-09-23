-- Remote site access: the portal's view of the network behind a router.
--
-- No credential is stored here. The router's API password stays in the server
-- environment, where it already lives, so there is nothing in this schema that
-- needs encrypting and nothing a database leak would hand an attacker. Admin
-- WireGuard peers store only their public key; private keys are generated on the
-- admin's own machine, or handed over once and never persisted.
--
-- The audit trail reuses wifi.audit_logs rather than adding a parallel table:
-- that one already carries an immutable_history trigger, so it cannot be edited
-- or deleted even by the runtime role. A new table would have started unprotected.

create table wifi.network_sites(
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references wifi.sites,
  name text not null check(length(name) between 1 and 100),
  router_identity text,
  router_os text,
  -- The blocks the router actually serves, refreshed from discovery. Every
  -- management target must fall inside one of these before it can be contacted.
  lan_cidrs text[] not null default '{}',
  management_cidr text,
  site_interface text not null default 'wg-babu',
  server_tunnel_address text,
  omada_inform_url text,
  last_discovered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(site_id, name)
);

create table wifi.network_devices(
  id uuid primary key default gen_random_uuid(),
  network_site_id uuid not null references wifi.network_sites on delete cascade,
  type text not null default 'UNKNOWN' check(type in ('ACCESS_POINT','ROUTER','CLIENT','UNKNOWN')),
  vendor text,
  model text,
  mac_address text not null check(mac_address ~ '^([0-9A-F]{2}:){5}[0-9A-F]{2}$'),
  ip_address inet,
  hostname text,
  interface text,
  dhcp_status text,
  source text not null default 'ARP' check(source in ('DHCP','ARP','BOTH')),
  -- A device is contactable only once an administrator has approved it. Discovery
  -- alone never opens a path to anything.
  approved_for_management boolean not null default false,
  status text not null default 'UNKNOWN',
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(network_site_id, mac_address)
);
create index network_devices_site on wifi.network_devices(network_site_id, approved_for_management);

create table wifi.remote_access_tunnels(
  id uuid primary key default gen_random_uuid(),
  network_site_id uuid not null references wifi.network_sites on delete cascade,
  type text not null check(type in ('SITE','ADMIN')),
  interface_name text not null,
  server_public_key text,
  router_public_key text,
  router_tunnel_ip inet,
  server_tunnel_ip inet,
  management_cidr text,
  status text not null default 'PLANNED' check(status in ('PLANNED','ACTIVE','DEGRADED','ROLLED_BACK')),
  last_handshake_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(network_site_id, type, interface_name)
);

create table wifi.admin_vpn_peers(
  id uuid primary key default gen_random_uuid(),
  network_site_id uuid not null references wifi.network_sites on delete cascade,
  user_id uuid not null references wifi.staff_profiles,
  label text not null default '',
  -- Public key only. A private key never reaches this table.
  public_key text not null,
  vpn_ip inet not null,
  enabled boolean not null default true,
  last_handshake_at timestamptz,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique(network_site_id, public_key),
  unique(network_site_id, vpn_ip)
);

-- A plan is reviewed, then applied. Storing it means apply can refuse anything
-- the administrator did not actually read: the digest is over the plan body.
create table wifi.network_plans(
  id uuid primary key default gen_random_uuid(),
  network_site_id uuid not null references wifi.network_sites on delete cascade,
  created_by uuid not null references wifi.staff_profiles,
  digest text not null,
  plan jsonb not null,
  status text not null default 'DRAFT' check(status in ('DRAFT','APPROVED','APPLIED','ROLLED_BACK','SUPERSEDED')),
  applied_at timestamptz,
  created_at timestamptz not null default now()
);
create index network_plans_site on wifi.network_plans(network_site_id, created_at desc);

-- What was planned and what was applied are history, not working state.
create function wifi.protect_plan() returns trigger language plpgsql as $$ begin
  if row(new.plan, new.digest, new.network_site_id, new.created_by)
     is distinct from row(old.plan, old.digest, old.network_site_id, old.created_by) then
    raise exception 'A recorded plan is immutable';
  end if;
  if old.status in ('APPLIED','ROLLED_BACK') and new.status <> old.status then
    raise exception 'An applied plan cannot be reopened';
  end if;
  return new;
end $$;
create trigger protect_plan before update on wifi.network_plans
  for each row execute function wifi.protect_plan();

create function wifi.touch_updated_at() returns trigger language plpgsql as $$ begin
  new.updated_at = now(); return new;
end $$;
create trigger touch_network_sites before update on wifi.network_sites
  for each row execute function wifi.touch_updated_at();
create trigger touch_network_devices before update on wifi.network_devices
  for each row execute function wifi.touch_updated_at();
create trigger touch_remote_access_tunnels before update on wifi.remote_access_tunnels
  for each row execute function wifi.touch_updated_at();

alter table wifi.network_sites enable row level security;
alter table wifi.network_devices enable row level security;
alter table wifi.remote_access_tunnels enable row level security;
alter table wifi.admin_vpn_peers enable row level security;
alter table wifi.network_plans enable row level security;
revoke all on wifi.network_sites, wifi.network_devices, wifi.remote_access_tunnels, wifi.admin_vpn_peers, wifi.network_plans from public, anon, authenticated;
grant select, insert, update on wifi.network_sites, wifi.network_devices, wifi.remote_access_tunnels, wifi.admin_vpn_peers to babu_runtime;
grant select, insert, update on wifi.network_plans to babu_runtime;
grant delete on wifi.admin_vpn_peers to babu_runtime;
create policy runtime_access on wifi.network_sites to babu_runtime using (true) with check (true);
create policy runtime_access on wifi.network_devices to babu_runtime using (true) with check (true);
create policy runtime_access on wifi.remote_access_tunnels to babu_runtime using (true) with check (true);
create policy runtime_access on wifi.admin_vpn_peers to babu_runtime using (true) with check (true);
create policy runtime_access on wifi.network_plans to babu_runtime using (true) with check (true);

-- The one site this portal runs. Discovery fills in the rest.
insert into wifi.network_sites(site_id, name, site_interface, server_tunnel_address)
select id, 'Shop network', 'wg-babu', '10.77.0.1' from wifi.sites
on conflict (site_id, name) do nothing;
