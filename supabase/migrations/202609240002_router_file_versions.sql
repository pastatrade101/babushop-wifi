-- Every hotspot file the portal writes to the router, and the file it replaced.
--
-- The router keeps one copy of login.html; this keeps all of them. A page
-- that breaks the customer login can be put back from here in one step,
-- without WinBox and without anyone having saved a copy first.
--
-- Rows are never changed or removed: the runtime role may only add and read.
create table wifi.router_file_versions(
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) <= 200 and name ~ '^[A-Za-z0-9_-]+(/[A-Za-z0-9._-]+)+$' and name !~ '\.\.'),
  contents text not null check (octet_length(contents) <= 61440),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  size integer not null check (size >= 0),
  reason text not null check (reason in ('BEFORE_UPLOAD','UPLOADED','BEFORE_RESTORE','RESTORED')),
  created_by uuid references wifi.staff_profiles,
  created_at timestamptz not null default now()
);
create index router_file_versions_name on wifi.router_file_versions(name, created_at desc);

alter table wifi.router_file_versions enable row level security;
revoke all on wifi.router_file_versions from public, anon, authenticated;
grant select, insert on wifi.router_file_versions to babu_runtime;
create policy runtime_access on wifi.router_file_versions to babu_runtime using (true) with check (true);
