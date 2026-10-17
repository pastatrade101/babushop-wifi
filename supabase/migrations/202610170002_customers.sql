-- Wi-Fi users: the people behind the phone numbers the shop has sold to (or who
-- started a mobile payment), with a name and a note the shop adds, and whether
-- they want SMS. Their purchases stay where they are (payment_intents,
-- manual_sales); this table holds only what the shop knows about the person.
--
-- Custom SMS go through the notification outbox like the voucher SMS: one row
-- per recipient, sent by the worker, recorded per campaign.

create or replace function wifi.tz_msisdn(raw text) returns text language sql immutable as $$
  select case
    when d ~ '^0[67][0-9]{8}$' then '255' || substr(d, 2)
    when d ~ '^255[67][0-9]{8}$' then d
    when d ~ '^[67][0-9]{8}$' then '255' || d
  end
  from (select regexp_replace(coalesce(raw, ''), '\D', '', 'g') as d) n
$$;

create table wifi.customers(
  site_id uuid not null references wifi.sites(id),
  phone text not null check (phone ~ '^255[67][0-9]{8}$'),
  name text check (name is null or char_length(btrim(name)) between 1 and 80),
  note text check (note is null or char_length(note) <= 300),
  sms_opt_out boolean not null default false,
  created_by uuid references wifi.staff_profiles,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (site_id, phone)
);

create table wifi.sms_campaigns(
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references wifi.sites(id),
  text text not null check (char_length(text) between 1 and 480),
  recipients integer not null check (recipients >= 0),
  created_by uuid references wifi.staff_profiles,
  created_at timestamptz not null default now()
);

do $$
declare c text;
begin
  for c in select conname from pg_constraint
    where conrelid='wifi.notification_outbox'::regclass and contype='c' and pg_get_constraintdef(oid) like '%kind%'
  loop
    execute format('alter table wifi.notification_outbox drop constraint %I', c);
  end loop;
end $$;
alter table wifi.notification_outbox
  add constraint notification_outbox_kind_check check (kind in ('SALE_PAID','VOUCHER_SMS','SALE_WHATSAPP','CUSTOM_SMS'));

alter table wifi.customers enable row level security;
revoke all on wifi.customers from public, anon, authenticated;
grant select, insert, update on wifi.customers to babu_runtime;
create policy runtime_access on wifi.customers to babu_runtime using (true) with check (true);

alter table wifi.sms_campaigns enable row level security;
revoke all on wifi.sms_campaigns from public, anon, authenticated;
grant select, insert on wifi.sms_campaigns to babu_runtime;
create policy runtime_access on wifi.sms_campaigns to babu_runtime using (true) with check (true);

grant execute on function wifi.tz_msisdn(text) to babu_runtime;
