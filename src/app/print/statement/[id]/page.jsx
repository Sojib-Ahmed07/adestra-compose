// src/app/print/statement/[id]/page.jsx
import { notFound } from "next/navigation";
import { formatDay, taka, todayDhaka } from "@/lib/accounts";
import { getParty, getPartyLedger } from "@/server/queries/accounts";
import { getShop } from "@/server/queries/settings";
import { Paper, ShopHeading } from "@/components/print/paper";
import { PrintBar } from "@/components/print/print-bar";

export const metadata = { title: "Statement" };

export default async function StatementPage({ params }) {
  const { id } = await params;
  const num = Number(id);
  if (!Number.isInteger(num) || num < 1) notFound();
  const [party, ledger, shop] = await Promise.all([getParty(num), getPartyLedger(num), getShop()]);
  if (!party) notFound();
  const lines = ledger.filter((l) => !l.voided);
  const balance = lines.at(-1)?.balance ?? 0;

  return (
    <>
      <PrintBar />
      <Paper size="a4">
        <ShopHeading shop={shop} />
        <div className="mb-4 flex justify-between border-y border-ink-400 py-2">
          <div>
            <p className="font-semibold">Account statement</p>
            <p>
              {party.name}
              {party.phone ? ` · ${party.phone}` : ""}
            </p>
            {party.address ? <p className="text-[0.9em]">{party.address}</p> : null}
          </div>
          <p className="text-right">Date: {formatDay(todayDhaka())}</p>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-ink-400 text-left">
              <th className="py-1 font-semibold">Date</th>
              <th className="py-1 font-semibold">Details</th>
              <th className="py-1 text-right font-semibold">Amount</th>
              <th className="py-1 text-right font-semibold">Paid</th>
              <th className="py-1 text-right font-semibold">Balance</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={`${l.type}-${l.id}`} className="border-b border-ink-100 align-top">
                <td className="py-1 whitespace-nowrap">{formatDay(l.date)}</td>
                <td className="py-1 pr-2">
                  {l.label}
                  {l.detail ? <span className="block text-[0.85em] text-ink-600">{l.detail}</span> : null}
                </td>
                <td className="tabular py-1 text-right">{l.type === "entry" ? taka(l.total) : "—"}</td>
                <td className="tabular py-1 text-right">{taka(l.paid)}</td>
                <td className="tabular py-1 text-right">{taka(l.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!lines.length ? <p className="py-6 text-center">No transactions.</p> : null}
        <div className="mt-4 ml-auto w-72 border-t-2 border-ink-900 pt-2 text-right text-[1.15em] font-bold">
          {balance > 0
            ? `Due to ${shop.name}: ${taka(balance)}`
            : balance < 0
              ? `${shop.name} owes: ${taka(-balance)}`
              : "Balance: settled"}
        </div>
        <div className="mt-20 flex justify-between text-[0.9em]">
          <p className="w-48 border-t border-ink-400 pt-1 text-center">Customer</p>
          <p className="w-48 border-t border-ink-400 pt-1 text-center">For {shop.name}</p>
        </div>
      </Paper>
    </>
  );
}
