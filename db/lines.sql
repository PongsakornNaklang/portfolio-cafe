-- What Bankza says on his own when you stop scrolling and clicking for a while (web/api/lines.js serves them).
-- Edit, add or delete rows in the Neon console (Tables); the site picks them up within a minute. Run this file once
-- to create the table and the starting lines (it won't touch rows that are already there).
--   spot    where you are or what's going on; join with + when all must hold (indoors+music_off). One of:
--           street, street_far, window (on the street, near the shop), door_shut, doorway, inside (standing in the
--           shop), seated, indoors (inside or seated in the shop), seat:center_table, seat:window_table,
--           seat:mcm_table, seat:cart_body (the plastic chair outside), center_free (not at the middle table),
--           drink_half, drink_empty, poured (you've tried latte art), music_on, music_off, dancing, day, sunset, night, won_easy (you beat him on
--           Easy), anywhere; greet is his hello as he waves when you reach the window (said then, not when idle;
--           greet+door_shut etc. are used instead whenever they hold)
--   egg     a hint: once you've found this easter egg he stops hinting at it. One of: dance, checkers,
--           checkers_hard, cat, records, honk, bird, chime, wall_lamp, drag, guestbook, night, latte
--   pose    what he does as he says it: wave, nod, shrug, look, point (look and point need a target)
--   target  the scene object he looks or points at (HOT_cat, vinyl_shelf, HOT_record, HOT_board, ...)
create table if not exists lines (
  id     text primary key,
  spot   text not null,
  text   text not null,
  egg    text,
  pose   text,
  target text
);

insert into lines (id, spot, text, egg, pose, target) values
  ('greet_1',        'greet',                  'Hi! Welcome to NAKANG.',                                   null, null,    null),
  ('greet_2',        'greet',                  'สวัสดีครับ! Come on in.',                                  null, null,    null),
  ('greet_3',        'greet',                  'Oh, hello! Fancy a coffee?',                               null, null,    null),
  ('greet_4',         'greet',                  'Hey there! Nice of you to drop by.',                        null, null,    null),
  ('greet_5',         'greet',                  'Morning! Or afternoon. I lose track in here.',              null, null,    null),
  ('greet_6',         'greet',                  'Oh hi! Door’s just there.',                                 null, null,    null),
  ('greet_7',         'greet',                  'Welcome, welcome! Mind the tuk-tuks.',                      null, null,    null),
  ('greet_8',         'greet',                  'Hello! First time at NAKANG?',                              null, null,    null),
  ('greet_9',         'greet',                  'หวัดดีครับ! Hot out there, come in.',                       null, null,    null),
  ('greet_10',        'greet',                  'Hey! The coffee’s on me. Well, sort of.',                   null, null,    null),
  ('greet_11',        'greet',                  'Ah, a customer! Make yourself at home.',                    null, null,    null),
  ('greet_12',        'greet',                  'Hi! Have a look around, tap anything.',                     null, null,    null),
  ('greet_door_1',    'greet+door_shut',        'Hi! Tap the door and come on in.',                          null, null,    null),
  ('greet_door_2',    'greet+door_shut',        'สวัสดีครับ! Give the door a tap, it’s open.',               null, null,    null),
  ('greet_door_3',    'greet+door_shut',        'Welcome! The door’s shut, just tap it.',                    null, null,    null),
  ('greet_door_4',    'greet+door_shut',        'Hey there! Tap the door to step inside.',                   null, null,    null),
  ('greet_door_5',    'greet+door_shut',        'Hello! Knock knock: tap the door.',                         null, null,    null),
  ('greet_door_6',    'greet+door_shut',        'Oh, a visitor! Tap the door, I’ll get the coffee on.',      null, null,    null),
  ('street_far_1',   'street_far',             'Hey! Over here!',                                          null, 'wave',  null),
  ('street_far_2',   'street_far',             'Keep scrolling, the shop’s this way.',                     null, 'nod',   null),
  ('window_1',       'window+door_shut',       'Door’s shut? Give it a tap.',                              null, 'point', 'HOT_door'),
  ('window_2',       'window',                 'My projects are in the case on the left.',                 null, 'look',  'case_back'),
  ('window_3',       'window',                 'Thirsty? Tap me.',                                         null, 'nod',   null),
  ('doorway_1',      'doorway',                'Mind the step!',                                           null, 'nod',   null),
  ('doorway_2',      'doorway',                'Welcome in!',                                              null, 'wave',  null),
  ('inside_1',       'inside',                 'What can I get you?',                                      null, 'nod',   null),
  ('inside_2',       'inside',                 'Grab a seat anywhere.',                                    null, 'point', 'center_table'),
  ('inside_3',       'inside',                 'The yellow book’s my portfolio. Have a flip.',             null, 'point', 'HOT_book'),
  ('seat_center',    'seat:center_table',      'Good table for a game, if you’re brave.',                  null, 'shrug', null),
  ('seat_window',    'seat:window_table',      'Best seat for people-watching.',                           null, 'nod',   null),
  ('seat_mcm',       'seat:mcm_table',         'That’s my favourite chair, you know.',                     null, 'nod',   null),
  ('seat_outside',   'seat:cart_body',         'Hot out there? Real Bangkok experience.',                  null, 'shrug', null),
  ('drink_half',     'drink_half',             'How’s the coffee?',                                        null, 'nod',   null),
  ('drink_empty',    'drink_empty',            'Want a refill?',                                           null, 'nod',   null),
  ('music_on',       'indoors+music_on',       'Ooh, I like this one.',                                    null, 'look',  'HOT_record'),
  ('music_off',      'indoors+music_off',      'Too quiet? The record player’s all yours.',                null, 'point', 'HOT_record'),
  ('dancing_1',      'dancing',                'Don’t film this.',                                         null, null,    null),
  ('dancing_2',      'dancing',                'I’ve been practising.',                                    null, null,    null),
  ('night',          'night',                  'Late one, huh? Me too.',                                   null, 'shrug', null),
  ('sunset',         'sunset',                 'Golden hour. Best light in the shop.',                     null, 'nod',   null),
  ('hint_dance_1',   'indoors+music_off',      'Put a record on, then ask me to dance.',                   'dance', 'point', 'HOT_record'),
  ('hint_dance_2',   'indoors+music_on',       'Like this one? Tap me and ask me to dance.',               'dance', 'nod',   null),
  ('hint_checkers',  'indoors+center_free',    'Sit at the middle table and ask me for a game of หมากฮอส.', 'checkers', 'point', 'center_table'),
  ('hint_hard',      'won_easy',               'Beat me on Easy? Try Hard. 🔥',                            'checkers_hard', 'shrug', null),
  ('hint_cat',       'indoors',                'The cat on the shell chair likes a scratch.',              'cat', 'look', 'HOT_cat'),
  ('hint_records',   'indoors',                'There’s more vinyl on the shelf.',                         'records', 'point', 'vinyl_shelf'),
  ('hint_tuktuk',    'street',                 'Tap a tuk-tuk going by. The driver’s a good boy.',         'honk', 'nod', null),
  ('hint_myna',      'street',                 'The mynas on the wire are jumpy.',                         'bird', 'shrug', null),
  ('hint_711',       'seat:cart_body',         'Hear that ding-dong? Look behind you.',                    'chime', 'look', 'seven_eleven'),
  ('hint_lamp',      'indoors+day',            'That orange lamp has a switch.',                           'wall_lamp', 'point', 'HOT_wall_lamp'),
  ('hint_drag',      'anywhere',               'Drag to look around.',                                     'drag', 'nod', null),
  ('hint_board',     'indoors',                'Leave me a doodle on the board?',                          'guestbook', 'point', 'HOT_board'),
  ('hint_latte',     'inside',                 'Order an iced latte and I might let you pour it yourself.', 'latte', 'nod', null),
  ('hint_latte2',    'indoors',                'There’s a milk jug back here with your name on it. Order an iced latte.', 'latte', 'nod', null),
  ('hint_latte3',    'drink_empty',            'Another? Make it a latte and you can pour it yourself.', 'latte', 'nod', null),
  ('latte_again',    'indoors+poured',         'Fancy another go at latte art? It’s on the menu now.', null, 'nod', null),
  ('latte_tulip',    'indoors+poured',         'Nailed the heart? Try a tulip next.', null, 'shrug', null),
  ('latte_refill',   'drink_empty+poured',     'Pour the next one yourself? Latte art’s on the menu.', null, 'nod', null),
  ('hint_night',     'day',                    'Come back after dark. The street lights up.',              'night', 'nod', null)
on conflict (id) do nothing;
