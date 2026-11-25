import { SellListProvider } from "@/components/sell/SellList";
import { getBuylistRules } from "@/lib/buylist/rules";

export const dynamic = "force-dynamic";

export default async function SellLayout({ children }: { children: React.ReactNode }) {
  const rules = await getBuylistRules();
  return <SellListProvider rules={rules}>{children}</SellListProvider>;
}
