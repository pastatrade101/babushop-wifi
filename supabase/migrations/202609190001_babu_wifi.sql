-- Isolated schema: never drops or rewrites legacy application data.
create schema if not exists wifi;
revoke all on schema wifi from public, anon, authenticated;
create table wifi.sites(id uuid primary key default gen_random_uuid(), name text not null, created_at timestamptz not null default now());
create table wifi.staff_profiles(id uuid primary key references auth.users(id), display_name text not null, role text not null check(role in ('ADMIN','CASHIER')), enabled boolean not null default true, created_at timestamptz not null default now());
create table wifi.packages(id uuid primary key default gen_random_uuid(), site_id uuid not null references wifi.sites, name text not null check(length(name) between 1 and 100), description text not null default '', price_tzs integer not null check(price_tzs between 1 and 10000000), duration_minutes integer not null check(duration_minutes between 1 and 525600), active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table wifi.voucher_batches(id uuid primary key default gen_random_uuid(), site_id uuid not null references wifi.sites, package_id uuid not null references wifi.packages, label text not null default '', quantity integer not null check(quantity between 1 and 1000), created_by uuid not null references wifi.staff_profiles, created_at timestamptz not null default now());
create table wifi.sale_reservations(id uuid primary key default gen_random_uuid(), staff_id uuid not null references wifi.staff_profiles, expires_at timestamptz not null, created_at timestamptz not null default now());
create table wifi.vouchers(id uuid primary key default gen_random_uuid(), site_id uuid not null references wifi.sites, batch_id uuid not null references wifi.voucher_batches, package_id uuid not null references wifi.packages, code_digest text not null unique, code_encrypted text not null, code_mask text not null, package_name text not null, price_tzs integer not null check(price_tzs>0), duration_minutes integer not null check(duration_minutes>0), policy text not null default 'ONE_DEVICE_WALL_CLOCK' check(policy='ONE_DEVICE_WALL_CLOCK'), inventory_state text not null default 'AVAILABLE' check(inventory_state in ('AVAILABLE','SOLD','VOID')), reservation_id uuid references wifi.sale_reservations, reserved_until timestamptz, created_at timestamptz not null default now(), sold_at timestamptz);
create index vouchers_stock on wifi.vouchers(package_id,inventory_state,reserved_until);
create table wifi.manual_sales(id uuid primary key default gen_random_uuid(), receipt_number text not null unique, cashier_id uuid not null references wifi.staff_profiles, site_id uuid not null references wifi.sites, reservation_id uuid not null unique references wifi.sale_reservations, total_tzs integer not null check(total_tzs>0), currency text not null default 'TZS' check(currency='TZS'), payment_method text not null default 'CASH' check(payment_method='CASH'), customer_name text, customer_phone text, notes text, created_at timestamptz not null default now());
create table wifi.manual_sale_items(id uuid primary key default gen_random_uuid(), sale_id uuid not null references wifi.manual_sales, voucher_id uuid not null unique references wifi.vouchers, package_name text not null, price_tzs integer not null check(price_tzs>0), duration_minutes integer not null check(duration_minutes>0));
create table wifi.sale_reversals(id uuid primary key default gen_random_uuid(), sale_id uuid not null unique references wifi.manual_sales, staff_id uuid not null references wifi.staff_profiles, reason text not null check(length(reason) between 3 and 500), created_at timestamptz not null default now());
create table wifi.portal_contexts(id uuid primary key default gen_random_uuid(), token_digest text not null unique, context jsonb not null, expires_at timestamptz not null, created_at timestamptz not null default now());
create table wifi.access_grants(id uuid primary key default gen_random_uuid(), voucher_id uuid not null unique references wifi.vouchers, client_mac text not null, state text not null check(state in ('PENDING','ACTIVE','EXPIRED','REVOKED','NEEDS_REVIEW')), proposed_expires_at timestamptz not null, expires_at timestamptz, activated_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index grants_expiry on wifi.access_grants(state,proposed_expires_at);
create table wifi.authorization_attempts(id uuid primary key default gen_random_uuid(), grant_id uuid not null references wifi.access_grants, context jsonb not null, deadline timestamptz not null, state text not null check(state in ('QUEUED','SENDING','ACCEPTED','REJECTED','NEEDS_REVIEW','CANCELLED')), evidence jsonb not null default '{}', review_note text, reviewed_by uuid references wifi.staff_profiles, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create unique index one_open_attempt on wifi.authorization_attempts(grant_id) where state in ('QUEUED','SENDING','NEEDS_REVIEW');
create table wifi.portal_status_tokens(token_digest text primary key, grant_id uuid not null references wifi.access_grants, expires_at timestamptz not null);
create table wifi.idempotency_records(staff_id uuid not null references wifi.staff_profiles, key uuid not null, request_hash text not null, response jsonb not null, created_at timestamptz not null default now(), primary key(staff_id,key));
create table wifi.jobs(id uuid primary key default gen_random_uuid(), attempt_id uuid not null unique references wifi.authorization_attempts, state text not null default 'READY' check(state in ('READY','LEASED','DONE')), due_at timestamptz not null default now(), lease_until timestamptz, created_at timestamptz not null default now());
create index jobs_due on wifi.jobs(state,due_at,lease_until);
create table wifi.audit_logs(id uuid primary key default gen_random_uuid(), actor_id uuid references wifi.staff_profiles, action text not null, entity_id uuid, details jsonb not null default '{}', created_at timestamptz not null default now());
create index sales_date on wifi.manual_sales(created_at,cashier_id);
create index audit_date on wifi.audit_logs(created_at);
create function wifi.immutable_history() returns trigger language plpgsql as $$ begin raise exception 'Historical records cannot be changed'; end $$;
create trigger immutable_sale before update or delete on wifi.manual_sales for each row execute function wifi.immutable_history();
create trigger immutable_item before update or delete on wifi.manual_sale_items for each row execute function wifi.immutable_history();
create trigger immutable_reversal before update or delete on wifi.sale_reversals for each row execute function wifi.immutable_history();
create trigger immutable_audit before update or delete on wifi.audit_logs for each row execute function wifi.immutable_history();
create function wifi.protect_voucher() returns trigger language plpgsql as $$ begin
 if row(new.package_id,new.batch_id,new.site_id,new.package_name,new.price_tzs,new.duration_minutes,new.policy,new.code_digest,new.code_encrypted) is distinct from row(old.package_id,old.batch_id,old.site_id,old.package_name,old.price_tzs,old.duration_minutes,old.policy,old.code_digest,old.code_encrypted) then raise exception 'Voucher terms are immutable'; end if;
 if old.inventory_state='VOID' and new.inventory_state<>'VOID' or old.inventory_state='SOLD' and new.inventory_state='AVAILABLE' then raise exception 'Inventory cannot be restored'; end if;
 return new; end $$;
create trigger protect_voucher before update on wifi.vouchers for each row execute function wifi.protect_voucher();
create function wifi.protect_grant() returns trigger language plpgsql as $$ begin
 if row(new.voucher_id,new.client_mac,new.proposed_expires_at) is distinct from row(old.voucher_id,old.client_mac,old.proposed_expires_at) then raise exception 'Device and deadline are immutable'; end if;
 return new; end $$;
create trigger protect_grant before update on wifi.access_grants for each row execute function wifi.protect_grant();
-- A password is provisioned separately by the deployment operator, never in source.
do $$ begin if not exists(select from pg_roles where rolname='babu_runtime') then create role babu_runtime nologin; end if; end $$;
grant usage on schema wifi to babu_runtime;
grant select,insert,update,delete on all tables in schema wifi to babu_runtime;
revoke update,delete on wifi.manual_sales,wifi.manual_sale_items,wifi.sale_reversals,wifi.audit_logs from babu_runtime;
do $$ declare t record; begin for t in select tablename from pg_tables where schemaname='wifi' loop
 execute format('alter table wifi.%I enable row level security',t.tablename);
 execute format('revoke all on wifi.%I from public,anon,authenticated',t.tablename);
 execute format('create policy runtime_access on wifi.%I to babu_runtime using (true) with check (true)',t.tablename);
end loop; end $$;
