// src/app/print/receipt/[id]/page.jsx
import { notFound } from "next/navigation";
import { formatDay, formatTime, payMethods, taka } from "@/lib/accounts";
import { cn } from "@/lib/utils";
import { getAccountSettings, getEntry } from "@/server/queries/accounts";
import { getShop } from "@/server/queries/settings";
import { Paper, receiptSizes, ShopHeading } from "@/components/print/paper";
import { PrintBar } from "@/components/print/print-bar";

export const metadata = { title: "Receipt" };

export default async function ReceiptPage({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const num = Number(id);
  if (!Number.isInteger(num) || num < 1) notFound();
  const [e, shop, acc] = await Promise.all([getEntry(num), getShop(), getAccountSettings()]);
  if (!e || e.kind !== "income") notFound();
  const size = Object.hasOwn(receiptSizes, sp.size) ? sp.size : "80";
  const roll = size === "80" || size === "58";

  return (
    <>
      <PrintBar sizes={receiptSizes} size={size} />
      <Paper size={size}>
        <ShopHeading shop={shop} compact={roll} />
        <div className={cn("flex justify-between border-y border-dashed border-ink-400 py-1.5", !roll && "mb-3")}>
          <span className="font-semibold">
            {e.voidedAt ? "CANCELLED" : "Cash memo"} #{e.id}
          </span>
          <span>
            {formatDay(e.date)} {formatTime(e.createdAt)}
          </span>
        </div>
        {e.party ? (
          <p className="py-1.5">
            Customer: <strong>{e.party.name}</strong>
            {e.party.phone ? ` · ${e.party.phone}` : ""}
          </p>
        ) : null}
        <table className="w-full">
          <thead>
            <tr className="border-b border-ink-400 text-left">
              <th className="py-1 font-semibold">Item</th>
              <th className="py-1 text-right font-semibold">Qty</th>
              {!roll ? <th className="py-1 text-right font-semibold">Rate</th> : null}
              <th className="py-1 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {e.items.map((it, i) => (
              <tr key={i} className="align-top">
                <td className="py-0.5 pr-1">
                  {it.name}
                  {roll && it.qty !== 1 ? <span className="block text-[0.85em]">@ {taka(it.rate)}</span> : null}
                </td>
                <td className="tabular py-0.5 text-right">{it.qty}</td>
                {!roll ? <td className="tabular py-0.5 text-right">{taka(it.rate)}</td> : null}
                <td className="tabular py-0.5 text-right">{taka(it.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className={cn("mt-1 space-y-0.5 border-t border-ink-400 pt-1", !roll && "ml-auto w-64")}>
          <Line label="Total" value={taka(e.total)} />
          {e.discount ? <Line label="Discount" value={`−${taka(e.discount)}`} /> : null}
          <Line label="To pay" value={taka(e.total - e.discount)} strong />
          <Line label={`Paid (${payMethods[e.method]})`} value={taka(e.paid)} />
          {e.due > 0 ? <Line label="Baki (due)" value={taka(e.due)} strong /> : null}
        </div>
        {e.note ? <p className="mt-2 text-[0.9em]">Note: {e.note}</p> : null}
        <div className="mt-3 border-t border-dashed border-ink-400 pt-2 text-center text-[0.9em]">
          {acc.receiptNote ? <p>{acc.receiptNote}</p> : null}
          <p className="text-[0.85em]">Served by {e.by || "—"}</p>
        </div>
        {!roll ? (
          <div className="mt-16 flex justify-end">
            <p className="w-48 border-t border-ink-400 pt-1 text-center text-[0.9em]">Signature</p>
          </div>
        ) : null}
      </Paper>
    </>
  );
}

function Line({ label, value, strong }) {
  return (
    <div className={cn("flex justify-between gap-3", strong && "font-bold")}>
      <span>{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
}
