-- The buyer's voucher by SMS, through the same outbox as the owner's sale email:
-- queued in the transaction that records the sale, sent afterwards by the worker,
-- one per sale however often the payment provider repeats its callback.
--
-- The rule that no voucher code is written here still holds. A VOUCHER_SMS row
-- carries the sale id and the buyer's number; the worker decrypts the code from
-- the voucher only at the moment it sends.

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
  add constraint notification_outbox_kind_check check (kind in ('SALE_PAID','VOUCHER_SMS'));

-- Each sender takes only its own kind from the queue.
create index if not exists notification_outbox_due_kind on wifi.notification_outbox(kind, next_attempt_at) where status = 'PENDING';
