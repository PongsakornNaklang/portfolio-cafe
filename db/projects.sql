-- What sits in the display case, one row per project. Edit rows in the Neon console (Tables) and the site
-- picks them up within a minute. Run this file once to create the table (it won't touch existing rows).
create table if not exists projects (
  id         text primary key,          -- short name; the page's card key is project:<id>
  position   int  not null default 0,   -- spot in the case: top shelf left to right, then the bottom shelf (8 spots)
  title      text not null,
  body       text not null default '',  -- the card text, also its page in the portfolio book
  url        text,                      -- adds an "Open" button
  link_label text,                      -- that button's text (default "Open <title>")
  model      text,                      -- a Blender model (ipod_classic) or a shape: sphere, cube, pyramid; empty = sphere
  image      text,                      -- its pictures, comma-separated paths in web/ (projects/iport.jpg) or URLs; the first is
                                        -- the cover; more make a gallery to swipe through on its card, and pages of pictures in the book
  tagline    text,                      -- one short line under the title
  tags       text,                      -- highlights shown as chips, comma-separated: 7 iPods, Real 3D, ...
  repo       text                       -- adds a "Source on GitHub" button
);
-- for a table made before these columns
alter table projects add column if not exists image text;
alter table projects add column if not exists tagline text;
alter table projects add column if not exists tags text;
alter table projects add column if not exists repo text;

insert into projects (id, position, title, body, url, link_label, model, image, tagline, tags, repo) values
  ('iport', 1, 'iPort', 'A faithful iPod simulator in the browser. Pick from seven models, from the iPod mini to the iPod touch, each running the software it shipped with: the Click Wheel, Cover Flow, games, and menus in six languages including Thai. Play your own files (nothing is uploaded), YouTube, SoundCloud or internet radio; spin it around in 3D, plug in EarPods on a cable that swings, and design your own colours, cases, stickers and engraving.',
   'https://iport-pi.vercel.app/', 'Open iPort', 'ipod_classic',
   'projects/iport.jpg, projects/iport-2.jpg, projects/iport-3.jpg, projects/iport-4.jpg, projects/iport-5.jpg',
   'The iPod, back in your browser.', '7 iPods, Real 3D, EarPods with physics, Your own music, Make it yours, React + TypeScript',
   'https://github.com/PongsakornNaklang/iport')
on conflict (id) do nothing;
