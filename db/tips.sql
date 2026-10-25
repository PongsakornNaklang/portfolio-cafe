-- Tips from Ko-fi, one row per payment, written by Ko-fi's webhook (web/api/tips.js). They fill the tip jar on the
-- counter. The name and message are only kept when the supporter made the tip public; their email is never kept.
-- Run this file once to create the table.
create table if not exists tips (
  id         text primary key,                    -- Ko-fi's kofi_transaction_id (a webhook retry won't count twice)
  type       text not null,                       -- Donation, Subscription, Commission or Shop Order
  name       text,                                -- from_name, when public
  message    text,                                -- when public
  amount     numeric,
  currency   text,
  created_at timestamptz not null default now()
);
