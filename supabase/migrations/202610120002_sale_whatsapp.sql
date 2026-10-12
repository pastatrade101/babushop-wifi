-- The owner's sale alert by WhatsApp, through Makutano Connect: the same sale
-- details as the SALE_PAID email, queued in the same transaction as the sale and
-- sent afterwards by the worker. One row per owner number (dedupe_key is
-- "<sale id>:<number>"), so a repeated provider callback cannot send two.
--
-- As with the email, the row holds the masked customer number and never a
-- voucher code.

alter table wifi.notification_outbox drop constraint if exists notification_outbox_kind_check;

alter table wifi.notification_outbox
  add constraint notification_outbox_kind_check check (kind in ('SALE_PAID','VOUCHER_SMS','SALE_WHATSAPP'));
