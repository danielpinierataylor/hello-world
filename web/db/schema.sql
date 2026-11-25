-- Good Games Morley marketplace schema (Postgres 16)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- TCGplayer catalogue (all games), mirrored from TCGCSV
CREATE TABLE IF NOT EXISTS tcg_groups (
  group_id     int PRIMARY KEY,
  category_id  int NOT NULL,
  game         text NOT NULL,
  name         text NOT NULL,
  abbreviation text,
  published_on date
);
CREATE INDEX IF NOT EXISTS tcg_groups_name ON tcg_groups (game, name);

CREATE TABLE IF NOT EXISTS tcg_products (
  product_id  int PRIMARY KEY,
  group_id    int NOT NULL,
  game        text NOT NULL,
  name        text NOT NULL,
  clean_name  text,
  number      text,
  rarity      text,
  image_url   text,
  extended    jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS tcg_products_group_number ON tcg_products (group_id, number);
CREATE INDEX IF NOT EXISTS tcg_products_name_trgm ON tcg_products USING gin (name gin_trgm_ops);

CREATE TABLE IF NOT EXISTS tcg_prices (
  product_id   int NOT NULL,
  sub_type     text NOT NULL,          -- Normal, Foil, Holofoil, Reverse Holofoil, 1st Edition...
  market_usd   numeric(12,2),
  low_usd      numeric(12,2),
  mid_usd      numeric(12,2),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, sub_type)
);

-- Magic printings, mirrored from Scryfall (powers the Scryfall-style search)
CREATE TABLE IF NOT EXISTS mtg_cards (
  id               uuid PRIMARY KEY,
  oracle_id        uuid,
  name             text NOT NULL,
  lang             text NOT NULL,
  set_code         text NOT NULL,
  set_name         text NOT NULL,
  set_type         text,
  collector_number text NOT NULL,
  rarity           text,
  mana_cost        text,
  cmc              numeric,
  type_line        text,
  oracle_text      text,
  flavor_text      text,
  colors           text[] NOT NULL DEFAULT '{}',
  color_identity   text[] NOT NULL DEFAULT '{}',
  keywords         text[] NOT NULL DEFAULT '{}',
  power            text,
  toughness        text,
  loyalty          text,
  legalities       jsonb NOT NULL DEFAULT '{}',
  finishes         text[] NOT NULL DEFAULT '{}',
  frame_effects    text[] NOT NULL DEFAULT '{}',
  promo_types      text[] NOT NULL DEFAULT '{}',
  border_color     text,
  frame            text,
  full_art         boolean,
  promo            boolean,
  reserved         boolean,
  game_changer     boolean,
  released_at      date,
  artist           text,
  image_normal     text,
  image_small      text,
  image_back       text,
  usd              numeric(12,2),
  usd_foil         numeric(12,2),
  usd_etched       numeric(12,2),
  tcgplayer_id     int,
  tcgplayer_etched_id int,
  edhrec_rank      int
);
CREATE INDEX IF NOT EXISTS mtg_cards_name_trgm ON mtg_cards USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS mtg_cards_oracle_trgm ON mtg_cards USING gin (oracle_text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS mtg_cards_type_trgm ON mtg_cards USING gin (type_line gin_trgm_ops);
CREATE INDEX IF NOT EXISTS mtg_cards_oracle_id ON mtg_cards (oracle_id);
CREATE INDEX IF NOT EXISTS mtg_cards_set ON mtg_cards (set_code, collector_number);
CREATE INDEX IF NOT EXISTS mtg_cards_tcg ON mtg_cards (tcgplayer_id);
CREATE INDEX IF NOT EXISTS mtg_cards_tcg_etched ON mtg_cards (tcgplayer_etched_id);

-- Store inventory (one row per sellable variant), sourced from Shopify / Game Locker
CREATE TABLE IF NOT EXISTS listings (
  sku                text PRIMARY KEY,
  shopify_variant_id bigint,
  shopify_product_id bigint,
  handle             text NOT NULL,
  title              text NOT NULL,
  game               text,               -- mtg | pokemon | pokemon-jp | onepiece | riftbound | NULL (unmatched)
  card_name          text,
  number             text,
  group_name         text,
  finish             text,               -- full finish text from title, e.g. "Extended Art Foil"
  sub_type           text,               -- TCGplayer printing: Normal / Foil / Holofoil ...
  condition          text NOT NULL DEFAULT 'NM',
  available          int NOT NULL DEFAULT 0,
  price_aud          numeric(12,2),
  tcg_product_id     int,
  scryfall_id        uuid,
  match_method       text,
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS listings_scryfall ON listings (scryfall_id) WHERE available > 0;
CREATE INDEX IF NOT EXISTS listings_tcg ON listings (tcg_product_id);
CREATE INDEX IF NOT EXISTS listings_game ON listings (game);

-- Staff-editable settings (buylist %, condition multipliers, FX rate, ...)
CREATE TABLE IF NOT EXISTS settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO settings (key, value) VALUES
  ('fx_usd_aud', '1.50'),
  ('buylist', '{
     "default": {"credit": 0.70, "cash": 0.60},
     "games": {"mtg": {"credit": 0.70, "cash": 0.60}},
     "conditions": {"NM": 1.0, "LP": 0.8, "MP": 0.75, "HP": 0.6, "DMG": 0.5},
     "minOfferAud": 0.05,
     "maxPerCard": 20
   }')
ON CONFLICT (key) DO NOTHING;

-- Game Locker export fields (GL is the source of truth for condition + prices)
ALTER TABLE listings ADD COLUMN IF NOT EXISTS gl_card_id text;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS gl_catalogue_id text;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS condition_label text;   -- full GL text, e.g. "Lightly Played", "PSA 10"
ALTER TABLE listings ADD COLUMN IF NOT EXISTS rarity text;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS gl_buy_cash_aud numeric(12,2);
ALTER TABLE listings ADD COLUMN IF NOT EXISTS gl_buy_credit_aud numeric(12,2);
ALTER TABLE listings ADD COLUMN IF NOT EXISTS on_shopify boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS listings_gl_card ON listings (gl_card_id);

ALTER TABLE listings ADD COLUMN IF NOT EXISTS shopify_image text;

-- History of staff inventory uploads
CREATE TABLE IF NOT EXISTS import_runs (
  id          bigserial PRIMARY KEY,
  kind        text NOT NULL,                 -- 'gl'
  filename    text,
  uploaded_by text,
  stats       jsonb,
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------- Buylist ----------
-- Hotlist: cards we want right now, with better rates. Matches a TCGplayer product + printing (sub_type).
CREATE TABLE IF NOT EXISTS hotlist (
  id             bigserial PRIMARY KEY,
  game           text NOT NULL,
  tcg_product_id int NOT NULL,
  sub_type       text NOT NULL DEFAULT 'Normal',
  credit_aud     numeric(12,2),          -- fixed NM offer (credit); NULL = use boost
  cash_aud       numeric(12,2),
  boost          numeric(5,3),           -- multiplier on normal offer, e.g. 1.15 (+15%)
  max_qty        int,                    -- stop buying after this many
  note           text,
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tcg_product_id, sub_type)
);

-- Customer sell submissions (prices are quoted at submit time and kept)
CREATE TABLE IF NOT EXISTS buylist_submissions (
  id            bigserial PRIMARY KEY,
  ref           text UNIQUE NOT NULL,                 -- short code customers quote, e.g. GGM-7K3Q
  name          text NOT NULL,
  email         text NOT NULL,
  phone         text,
  payout        text NOT NULL CHECK (payout IN ('credit', 'cash')),
  delivery      text NOT NULL CHECK (delivery IN ('dropoff', 'post')),
  notes         text,
  status        text NOT NULL DEFAULT 'submitted',    -- submitted -> received -> graded -> paid | cancelled
  quoted_total  numeric(12,2) NOT NULL,
  final_total   numeric(12,2),
  fx_usd_aud    numeric(8,4) NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS buylist_items (
  id              bigserial PRIMARY KEY,
  submission_id   bigint NOT NULL REFERENCES buylist_submissions(id) ON DELETE CASCADE,
  game            text NOT NULL,
  tcg_product_id  int NOT NULL,
  sub_type        text NOT NULL,
  scryfall_id     uuid,
  name            text NOT NULL,
  set_name        text,
  number          text,
  condition       text NOT NULL,             -- as claimed by customer
  qty             int NOT NULL CHECK (qty > 0),
  unit_quote      numeric(12,2) NOT NULL,     -- per card, in chosen payout
  hot             boolean NOT NULL DEFAULT false,
  received_qty    int,
  graded_condition text,
  unit_final      numeric(12,2)
);
CREATE INDEX IF NOT EXISTS buylist_items_sub ON buylist_items (submission_id);

CREATE INDEX IF NOT EXISTS listings_tcg_sub ON listings (tcg_product_id, sub_type);
