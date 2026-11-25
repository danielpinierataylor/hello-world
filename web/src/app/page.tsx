import { SearchBar } from "@/components/SearchBar";
import Link from "next/link";

export default function Home() {
  return (
    <div className="mx-auto max-w-3xl pt-16 space-y-10">
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-black tracking-tight">Find any card.</h1>
        <p className="text-muted">Search 117,000+ singles in stock at Good Games Morley, with Scryfall-style search.</p>
      </div>
      <SearchBar big />
      <div className="grid gap-3 sm:grid-cols-3 text-sm">
        <Link href="/sell" className="rounded-xl border border-line bg-panel p-4 hover:border-brand">
          <div className="font-semibold">Sell to us</div><div className="text-muted">70% store credit · 60% cash</div>
        </Link>
        <Link href="/events" className="rounded-xl border border-line bg-panel p-4 hover:border-brand">
          <div className="font-semibold">Events</div><div className="text-muted">Lock in your spot</div>
        </Link>
        <Link href="/sale" className="rounded-xl border border-line bg-panel p-4 hover:border-brand">
          <div className="font-semibold">On sale</div><div className="text-muted">This week&apos;s deals</div>
        </Link>
      </div>
    </div>
  );
}
