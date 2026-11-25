import { sql } from "@/lib/db";
import { UploadForm } from "./UploadForm";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const runs = await sql`SELECT id, filename, stats, error, created_at FROM import_runs ORDER BY created_at DESC LIMIT 15`;
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Update stock from Game Locker</h1>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted">
          <li>In Game Locker (staff), export your inventory as CSV.</li>
          <li>Upload it here. Stock, prices and conditions on the website update straight away.</li>
          <li>Do this at least once a day (Near Mint stock will be live from Shopify once that&apos;s connected).</li>
        </ol>
      </div>
      <UploadForm />
      <section className="space-y-2">
        <h2 className="font-semibold">Recent uploads</h2>
        <div className="overflow-x-auto rounded-xl border border-line text-sm">
          <table className="w-full">
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className="p-2 whitespace-nowrap text-muted">{new Date(r.created_at).toLocaleString("en-AU", { timeZone: "Australia/Perth" })}</td>
                  <td className="p-2">{r.filename}</td>
                  <td className="p-2">{r.error ? <span className="text-red-400">{r.error}</span> : `${Number(r.stats?.units ?? 0).toLocaleString()} cards in stock`}</td>
                </tr>
              ))}
              {runs.length === 0 && <tr><td className="p-3 text-muted">No uploads yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
