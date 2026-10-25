-- What sits in the display case, one row per project. Edit rows in the Neon console (Tables) and the site
-- picks them up within a minute. Run this file once to create the table (it won't touch existing rows).
create table if not exists projects (
  id         text primary key,          -- short name; the page's card key is project:<id>
  position   int  not null default 0,   -- spot in the case: top shelf left to right, then the bottom shelf (8 spots)
  title      text not null,
  body       text not null default '',  -- the card text, also its page in the portfolio book
  url        text,                      -- adds an "Open" button
  link_label text,                      -- that button's text (default "Open <title>")
  model      text                       -- a Blender model (ipod_classic) or a shape: sphere, cube, pyramid; empty = sphere
);

insert into projects (id, position, title, body, url, link_label, model) values
  ('iport', 1, 'iPort', 'A web iPod: pick a song and click through a classic iPod interface in the browser.',
   'https://iport-pi.vercel.app/', 'Open iPort', 'ipod_classic')
on conflict (id) do nothing;
