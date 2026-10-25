-- Visitor counter: one row per visitor per day (the LED counter on the shopfront shows the total).
-- A visitor is a keyed hash of their IP and the day, so the same person counts again tomorrow, reloading
-- doesn't count twice, and no IP is stored. Run this file once to create the table.
create table if not exists visits (
  day     date not null,
  ip_hash text not null,
  primary key (day, ip_hash)
);
