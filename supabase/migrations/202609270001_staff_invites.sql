-- Staff can be invited from the portal, and there is a third role.
--
-- SALES sells and follows the money -- Sell internet, Vouchers, Sales, Mobile
-- payments, Revenue and Wi-Fi sessions -- and touches nothing that changes the
-- shop's setup. The email is kept on the profile so the Staff page can show
-- who was invited; activated_at records when the person finished setting up
-- their own password from the invite link.

-- The role check was created unnamed with the table; drop whichever name it got.
do $$ declare c text; begin
 for c in select conname from pg_constraint
  where conrelid='wifi.staff_profiles'::regclass and contype='c' and pg_get_constraintdef(oid) like '%role%'
 loop execute format('alter table wifi.staff_profiles drop constraint %I',c); end loop;
end $$;
alter table wifi.staff_profiles add constraint staff_profiles_role_check check (role in ('ADMIN','CASHIER','SALES'));

alter table wifi.staff_profiles
  add column email text check (email = lower(email) and length(email) between 3 and 254),
  add column invited_by uuid references wifi.staff_profiles,
  add column invited_at timestamptz,
  add column activated_at timestamptz;
create unique index staff_profiles_email on wifi.staff_profiles (email) where email is not null;

-- Staff created on the command line got a password there: they are active,
-- and their address is in auth.users.
update wifi.staff_profiles p
   set email = lower(u.email), activated_at = coalesce(p.activated_at, p.created_at)
  from auth.users u where u.id = p.id;
