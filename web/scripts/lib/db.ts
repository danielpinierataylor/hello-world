import postgres from "postgres";
import { readFileSync, existsSync } from "node:fs";

// Load .env.local for scripts (Next.js loads it for the app itself)
if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

export const sql = postgres(process.env.DATABASE_URL!, { max: 4, onnotice: () => {} });

export const UA = "ggm-marketplace/0.1";

export async function fetchJson<T = any>(url: string, tries = 4): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      return (await r.json()) as T;
    } catch (e) {
      if (i >= tries - 1) throw e;
      await new Promise((res) => setTimeout(res, 500 * 2 ** i));
    }
  }
}
