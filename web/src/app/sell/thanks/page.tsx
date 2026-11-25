import Link from "next/link";

type SP = Promise<Record<string, string | undefined>>;

export default async function Thanks({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const ref = /^GGM-[A-Z0-9]{5}$/.test(sp.ref ?? "") ? sp.ref! : null;
  const total = Number(sp.total ?? 0);
  const dropped = Number(sp.dropped ?? 0);
  return (
    <div className="mx-auto max-w-xl space-y-5 pt-10 text-center">
      <div className="text-5xl">✓</div>
      <h1 className="text-3xl font-bold">Sell list received</h1>
      {ref && (
        <div className="rounded-xl border border-line bg-panel p-5">
          <div className="text-sm text-muted">Your reference</div>
          <div className="font-mono text-3xl font-black tracking-wider">{ref}</div>
          <div className="mt-2 text-sm text-muted">
            Estimated {sp.payout === "cash" ? "cash" : "store credit"}: <b className="text-fg">A${total.toFixed(2)}</b>
          </div>
        </div>
      )}
      <div className="space-y-2 text-left text-sm text-muted">
        {sp.delivery === "post" ? (
          <p>Write <b className="text-fg">{ref}</b> on a note inside the package and post your cards to <b className="text-fg">Good Games Morley, 1/154 Russell St, Morley WA 6062</b>. Sleeve and top-load anything valuable.</p>
        ) : (
          <p>Bring your cards to <b className="text-fg">Good Games Morley, 1/154 Russell St, Morley</b> and quote <b className="text-fg">{ref}</b> at the counter.</p>
        )}
        <p>We&apos;ll check condition, confirm the final amount, then pay you.</p>
        {dropped > 0 && <p className="text-amber-400">{dropped} card{dropped === 1 ? " was" : "s were"} removed because we&apos;re not buying {dropped === 1 ? "it" : "them"} right now.</p>}
      </div>
      <Link href="/sell" className="inline-block text-brand hover:underline">Sell more cards →</Link>
    </div>
  );
}
