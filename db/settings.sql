-- Site settings the page reads at load, one row per key. Everything here is public (served by web/api/settings.js),
-- so never put a secret in it. Edit values in the Neon console (Tables). Run this file once to create the table.
--   tip_qr_promptpay, tip_qr_truemoney, tip_qr_alipay
--             the tip jar's QRs, each a data URL (data:image/png;base64,...); the card shows a tab for each one set
--   kofi_url  the tip jar's Ko-fi link (https://...)
create table if not exists settings (
  key   text primary key,
  value text not null
);
