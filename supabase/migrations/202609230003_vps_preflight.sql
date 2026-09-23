-- Where the host facts live.
--
-- The planner needs to know the server's routing mode, forwarding flag and the
-- AllowedIPs it must restore on rollback. None of it can be read from inside the
-- API container, which has its own network namespace, and several values need
-- root. So an administrator captures them once and records them here, with an
-- audit entry naming who did it and when.
--
-- Nothing stored here is secret: AllowedIPs, a peer's public key, a routing
-- directive and a firewall status are all safe to hold. The router password
-- stays in the server environment, as before.

alter table wifi.network_sites add column vps_preflight jsonb not null default '{}'::jsonb;
alter table wifi.network_sites add column preflight_captured_at timestamptz;
