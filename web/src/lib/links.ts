// Outbound links to the systems that actually take payment today.
export const GL_LOCATION_ID = "32b886fb-007a-4266-a752-9f781444735b"; // Good Games Morley on Game Locker
export const SHOP_URL = "https://goodgamesmorley.com.au";

const slug = (s: string | null | undefined) =>
  (s ?? "card").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "card";

const GAME_SLUGS: Record<string, string> = {
  mtg: "magic-the-gathering", pokemon: "pokemon", "pokemon-jp": "pokemon-japan", onepiece: "one-piece", riftbound: "riftbound",
};

/** Game Locker card page. GL resolves the page from the catalogue id alone; the slugs are cosmetic. */
export function gameLockerUrl(l: { gl_catalogue_id: string | null; game: string | null; group_name: string | null; card_name: string | null }) {
  if (!l.gl_catalogue_id) return `https://gamelocker.co/store/morley`;
  return `https://gamelocker.co/cards/${GAME_SLUGS[l.game ?? ""] ?? "cards"}/${slug(l.group_name)}/${slug(l.card_name)}/${l.gl_catalogue_id}?location=${GL_LOCATION_ID}`;
}

export const shopifyProductUrl = (handle: string) => `${SHOP_URL}/products/${handle}`;
