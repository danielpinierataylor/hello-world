"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { importGl, parseGlCsv, type ImportStats } from "@/lib/import/gl";

export type UploadState = { ok: boolean; message: string; stats?: ImportStats } | null;

export async function uploadGlExport(_prev: UploadState, form: FormData): Promise<UploadState> {
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose the Game Locker export (.csv) first." };
  if (!/\.csv$/i.test(file.name)) return { ok: false, message: "That isn't a .csv file. Export inventory from Game Locker as CSV." };
  try {
    const rows = parseGlCsv(Buffer.from(await file.arrayBuffer()));
    const stats = await importGl(sql, rows);
    await sql`INSERT INTO import_runs (kind, filename, stats) VALUES ('gl', ${file.name}, ${sql.json(stats)})`;
    revalidatePath("/staff/import");
    return { ok: true, message: `Imported ${stats.rows.toLocaleString()} rows: ${stats.units.toLocaleString()} cards in stock.`, stats };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await sql`INSERT INTO import_runs (kind, filename, error) VALUES ('gl', ${file.name}, ${message})`;
    return { ok: false, message };
  }
}
