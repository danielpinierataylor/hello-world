import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Good Games Morley — Singles",
  description: "Magic, Pokémon, One Piece and Riftbound singles from Good Games Morley, Perth.",
};

const NAV = [
  { href: "/search", label: "Singles" },
  { href: "/sell", label: "Sell to us" },
  { href: "/events", label: "Events" },
  { href: "/sale", label: "On sale" },
];

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <header className="border-b border-line bg-panel/80 backdrop-blur sticky top-0 z-20">
          <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3">
            <Link href="/" className="font-black tracking-tight text-lg whitespace-nowrap">
              good<span className="text-brand">games</span> <span className="text-muted font-semibold">Morley</span>
            </Link>
            <nav className="flex gap-4 text-sm text-muted overflow-x-auto">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="hover:text-fg whitespace-nowrap">{n.label}</Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
