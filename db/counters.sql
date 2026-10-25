-- Small tallies shared by every visitor: cat pets ("cat"), drinks ordered ("drink:<id>"), song requests
-- ("request:<record id>"), and checkers results
-- ("checkers:<easy|hard>:<win|lose|draw>", from the visitor's side). Run this file once to create the table.
create table if not exists counters (
  name text primary key,
  n    bigint not null default 0
);
