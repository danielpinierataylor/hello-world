# Good Games Morley marketplace

Our own storefront + buylist on top of Shopify (Shopify / Game Locker stay the source of truth for stock).

## Data pipeline (dev)

```bash
# Postgres 16 running locally; DATABASE_URL in .env.local
npm run db:schema
npm run ingest:scryfall            # all Magic printings (search data)
npm run ingest:tcgcsv              # TCGplayer catalogue + market prices: Magic, Pokémon, One Piece, Riftbound, Pokémon JP
npm run import:inventory -- export1.csv export2.csv   # Shopify inventory export -> listings, matched to TCGplayer/Scryfall
```

Behind the cloud proxy, Node needs `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`.

- Game Locker titles follow TCGplayer naming: `Name Number (Set) - Finish`; `scripts/lib/match.ts` parses and matches them.
- Legacy BinderPOS listings (pattern SKUs, zero stock) are ignored.
- Staff settings (buylist %, condition multipliers, USD→AUD rate) live in the `settings` table.
