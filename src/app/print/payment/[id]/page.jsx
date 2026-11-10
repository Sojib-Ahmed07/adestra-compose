// src/app/print/payment/[id]/page.jsx
import { notFound } from "next/navigation";
import { formatDay, formatTime, payMethods, taka } from "@/lib/accounts";
import { bnAmount, enAmount } from "@/lib/number-words";
import { getParty, getPayment } from "@/server/queries/accounts";
import { getShop } from "@/server/queries/settings";
import { Paper, receiptSizes, ShopHeading } from "@/components/print/paper";
import { PrintBar } from "@/components/print/print-bar";

export const metadata = { title: "Money receipt" };

export default async function PaymentReceiptPage({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const num = Number(id);
  if (!Number.isInteger(num) || num < 1) notFound();
  const [p, shop] = await Promise.all([getPayment(num), getShop()]);
  if (!p) notFound();
  const party = await getParty(p.party.id);
  const size = Object.hasOwn(receiptSizes, sp.size) ? sp.size : "80";
  const taka100 = Math.round(p.amount * 100);
  const words = { taka: Math.floor(taka100 / 100), poisa: taka100 % 100 };
  const received = p.direction === "in";

  return (
    <>
      <PrintBar sizes={receiptSizes} size={size} />
      <Paper size={size}>
        <ShopHeading shop={shop} compact={size === "80" || size === "58"} />
        <div className="flex justify-between border-y border-dashed border-ink-400 py-1.5">
          <span className="font-semibold">
            {p.voidedAt ? "CANCELLED · " : ""}
            {received ? "Money receipt" : "Payment voucher"} #P{p.id}
          </span>
          <span>
            {formatDay(p.date)} {formatTime(p.createdAt)}
          </span>
        </div>
        <div className="space-y-1.5 py-3">
          <p>
            {received ? "Received from" : "Paid to"}: <strong>{p.party.name}</strong>
            {p.party.phone ? ` · ${p.party.phone}` : ""}
          </p>
          <p className="text-[1.3em] font-bold">{taka(p.amount)}</p>
          <p className="text-[0.9em]">{enAmount(words)}</p>
          <p className="font-bangla text-[0.9em]">{bnAmount(words)}</p>
          <p>
            By: {payMethods[p.method]}
            {p.note ? ` · ${p.note}` : ""}
          </p>
        </div>
        {party ? (
          <p className="border-t border-dashed border-ink-400 pt-2">
            {received ? "Baki still due" : "Still owed"}:{" "}
            <strong>{taka(Math.max(0, received ? party.receivable : party.payable))}</strong>
          </p>
        ) : null}
        <p className="mt-3 text-center text-[0.85em]">Received by {p.by || "—"}</p>
      </Paper>
    </>
  );
}
