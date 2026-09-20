-- Existing simulation/Omada grants must never authorize real MikroTik access.
alter table wifi.access_grants add column provider text not null default 'legacy'
  check (provider in ('legacy','mikrotik-radius'));
alter table wifi.access_grants add constraint radius_fixed_expiry check (
  provider <> 'mikrotik-radius' or (expires_at is not null and activated_at is not null and expires_at = proposed_expires_at)
);
create or replace function wifi.protect_grant() returns trigger language plpgsql as $$ begin
 if row(new.voucher_id,new.client_mac,new.proposed_expires_at,new.provider) is distinct from row(old.voucher_id,old.client_mac,old.proposed_expires_at,old.provider) then raise exception 'Device and deadline are immutable'; end if;
 if old.provider='mikrotik-radius' and row(new.activated_at,new.expires_at) is distinct from row(old.activated_at,old.expires_at) then raise exception 'Activation and expiry are immutable'; end if;
 if old.provider='mikrotik-radius' and old.state in ('EXPIRED','REVOKED') and new.state not in ('EXPIRED','REVOKED') then raise exception 'Ended access cannot be restored'; end if;
 return new;
end $$;

create table wifi.network_sessions (
 id uuid primary key default gen_random_uuid(), grant_id uuid not null references wifi.access_grants,
 nas text not null, session_id text not null, created_at timestamptz not null default now(),
 last_seen_at timestamptz not null default now(), stopped_at timestamptz, terminate_cause text,
 session_seconds bigint not null default 0 check(session_seconds>=0),
 upload_bytes numeric(20,0) not null default 0 check(upload_bytes>=0),
 download_bytes numeric(20,0) not null default 0 check(download_bytes>=0), unique(nas,session_id)
);
create index sessions_grant on wifi.network_sessions(grant_id);
alter table wifi.network_sessions enable row level security;
revoke all on wifi.network_sessions from public,anon,authenticated;
grant select,insert,update on wifi.network_sessions to babu_runtime;
create policy runtime_access on wifi.network_sessions to babu_runtime using(true) with check(true);
