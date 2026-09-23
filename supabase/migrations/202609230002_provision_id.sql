-- A provisioning run needs its own identity.
--
-- Rollback on the router matches an object's comment. When that comment named
-- only the site, rolling back a failed apply would also have matched every rule
-- a previous successful apply had created at the same site. The provision id
-- makes each run's objects distinguishable, so a rollback can only reach its own.

alter table wifi.network_plans add column provision_id uuid;
update wifi.network_plans
   set provision_id = coalesce((plan ->> 'provisionId')::uuid, gen_random_uuid())
 where provision_id is null;
alter table wifi.network_plans alter column provision_id set not null;
create unique index network_plans_provision on wifi.network_plans(provision_id);

-- The provision id is part of what makes a recorded plan that plan.
create or replace function wifi.protect_plan() returns trigger language plpgsql as $$ begin
  if row(new.plan, new.digest, new.provision_id, new.network_site_id, new.created_by)
     is distinct from row(old.plan, old.digest, old.provision_id, old.network_site_id, old.created_by) then
    raise exception 'A recorded plan is immutable';
  end if;
  if old.status in ('APPLIED','ROLLED_BACK') and new.status <> old.status then
    raise exception 'An applied plan cannot be reopened';
  end if;
  return new;
end $$;
