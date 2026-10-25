-- The guestbook board, shared by every visitor: each "Stick it on the board" saves the whole picture as a new row,
-- and the site shows the newest. The last 50 stay, so a wiped or spoiled board can be put back: delete the rows
-- newer than the good one in the Neon console. Run this file once to create the table.
create table if not exists guestbook (
  id         bigserial primary key,
  image      text not null,                       -- the board as a data URL (WebP, or PNG from Safari)
  ip_hash    text not null,                       -- keyed hash of the sender's IP, for the 15 s limit (never the IP)
  created_at timestamptz not null default now()
);
