-- How many messages each visitor sent Bankza's chat today, for the daily limits in web/api/chat.js
-- (20 a visitor, plus a row with ip_hash 'all' for the whole site). Run this file once to create the table.
create table if not exists chat_uses (
  ip_hash text not null,                 -- keyed hash of the sender's IP (never the IP), or 'all'
  day     date not null default current_date,
  n       int  not null default 0,
  primary key (ip_hash, day)
);
