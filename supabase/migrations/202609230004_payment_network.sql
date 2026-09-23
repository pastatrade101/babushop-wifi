-- Which network the buyer actually paid from.
--
-- The provider was recorded, but not the network behind it, so a sale showed
-- "azam" and nothing about whether the money came from M-Pesa, Airtel or Tigo.
-- That is the first thing anyone asks when a payment has to be traced or
-- reconciled with a mobile money statement.

alter table wifi.payment_intents add column network text;
create index payment_intents_followup on wifi.payment_intents(status, created_at desc);
