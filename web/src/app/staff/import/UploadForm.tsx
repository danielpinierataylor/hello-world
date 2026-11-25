"use client";

import { useActionState } from "react";
import { uploadGlExport, type UploadState } from "./actions";

const GAME_LABEL: Record<string, string> = { mtg: "Magic", pokemon: "Pokémon", onepiece: "One Piece", riftbound: "Riftbound", "pokemon-jp": "Pokémon JP" };

export function UploadForm() {
  const [state, action, pending] = useActionState<UploadState, FormData>(uploadGlExport, null);
  return (
    <form action={action} className="space-y-4 rounded-xl border border-line bg-panel p-5">
      <label className="block space-y-2">
        <span className="font-semibold">Game Locker inventory export (.csv)</span>
        <input type="file" name="file" accept=".csv,text/csv" required
          className="block w-full text-sm file:mr-3 file:rounded file:border-0 file:bg-brand file:px-3 file:py-2 file:font-semibold file:text-white" />
      </label>
      <button disabled={pending} className="rounded-lg bg-brand px-5 py-2.5 font-semibold text-white disabled:opacity-50">
        {pending ? "Importing… (about 10 seconds)" : "Upload & update stock"}
      </button>
      {state && (
        <div className={`rounded-lg p-4 text-sm ${state.ok ? "bg-accent/10 text-accent" : "bg-red-500/10 text-red-400"}`}>
          <p className="font-semibold">{state.ok ? "✓ " : "✗ "}{state.message}</p>
          {state.stats && (
            <ul className="mt-2 space-y-0.5 text-fg/80">
              {Object.entries(state.stats.byGame).map(([g, n]) => <li key={g}>{GAME_LABEL[g] ?? g}: {n.toLocaleString()} cards</li>)}
              <li>Stock value: A${state.stats.stockValueAud.toLocaleString()}</li>
              {state.stats.newlyMatched > 0 && <li>{state.stats.newlyMatched} new cards matched to the card database</li>}
              {state.stats.unmatchedInStock > 0 && <li className="text-amber-400">{state.stats.unmatchedInStock} in-stock listings couldn&apos;t be matched (they still show by name)</li>}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}
