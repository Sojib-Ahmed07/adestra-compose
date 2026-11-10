// src/app/(app)/accounts/entries/[id]/page.jsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { Printer } from "lucide-react";
import { dhakaDateOf, formatDay, formatTime, payMethods, taka, todayDhaka } from "@/lib/accounts";
import { getEntry } from "@/server/queries/accounts";
import { requireUser } from "@/server/session";
import { VoidButton } from "@/components/accounts/void-button";
import { buttonClass } from "@/components/ui/button";
import { Badge, Card, PageHeader } from "@/components/ui/misc";

export async function generateMetadata({ params }) {
  const { id } = await params;
  return { title: `Entry #${id}` };
}

export default async function EntryPage({ params }) {
  const user = await requireUser();
  const { id } = await params;
  const num = Number(id);
  if (!Number.isInteger(num) || num < 1) notFound();
  const e = await getEntry(num);
  if (!e) notFound();

  const isSale = e.kind === "income";
  const canVoid =
    !e.voidedAt && (user.role === "owner" || (e.createdBy === user.id && dhakaDateOf(e.createdAt) === todayDhaka()));

  return (
    <>
      <PageHeader
        title={`${isSale ? "Sale" : "Expense"} #${e.id}`}
        description={`${formatDay(e.date, { weekday: true })} · entered ${formatTime(e.createdAt)} by ${e.by || "a removed person"}`}
        action={
          <div className="flex flex-wrap gap-2">
            {isSale ? (
              <>
                <a
                  href={`/print/receipt/${e.id}?size=80`}
                  target="_blank"
                  rel="noopener"
                  className={buttonClass({ variant: "accent", size: "sm" })}
                >
                  <Printer className="h-3.5 w-3.5" /> Receipt (80mm)
                </a>
                <a
                  href={`/print/receipt/${e.id}?size=a5`}
                  target="_blank"
                  rel="noopener"
                  className={buttonClass({ variant: "outline", size: "sm" })}
                >
                  A5
                </a>
                <a
                  href={`/print/receipt/${e.id}?size=a4`}
                  target="_blank"
                  rel="noopener"
                  className={buttonClass({ variant: "outline", size: "sm" })}
                >
                  A4
                </a>
              </>
            ) : null}
            {canVoid ? <VoidButton id={e.id} /> : null}
          </div>
        }
      />

      {e.voidedAt ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-danger-50 px-4 py-3 text-sm text-danger">
          <strong>Cancelled</strong> {formatDay(dhakaDateOf(e.voidedAt))} {formatTime(e.voidedAt)} by{" "}
          {e.voidedByName || "a removed person"} — “{e.voidReason}”. It isn't counted in any totals.
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
        <Card className="p-5">
          {isSale ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="py-2 font-medium">Item</th>
                  <th className="py-2 text-right font-medium">Qty</th>
                  <th className="py-2 text-right font-medium">Rate</th>
                  <th className="py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {e.items.map((it, i) => (
                  <tr key={i}>
                    <td className="py-2">{it.name}</td>
                    <td className="tabular py-2 text-right">{it.qty}</td>
                    <td className="tabular py-2 text-right">{taka(it.rate)}</td>
                    <td className="tabular py-2 text-right">{taka(it.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm">
              <Badge tone="danger">{e.category}</Badge>
            </p>
          )}
          {e.note ? <p className="mt-4 text-sm text-muted">Note: {e.note}</p> : null}
        </Card>

        <Card className="h-fit p-5">
          <dl className="space-y-2 text-sm">
            {isSale ? (
              <>
                <Row label="Total" value={taka(e.total)} />
                {e.discount ? <Row label="Discount" value={`−${taka(e.discount)}`} /> : null}
                <Row label="To pay" value={taka(e.total - e.discount)} strong />
              </>
            ) : (
              <Row label="Amount" value={taka(e.total)} strong />
            )}
            <Row label={`Paid (${payMethods[e.method]})`} value={taka(e.paid)} />
            <Row
              label={e.due > 0 ? (isSale ? "Baki" : "Owed to supplier") : "Balance"}
              value={e.due > 0 ? taka(e.due) : "Fully paid"}
              tone={e.due > 0 ? "text-warn" : "text-success"}
            />
          </dl>
          <div className="mt-4 border-t border-line pt-4 text-sm">
            <p className="text-xs text-muted">{isSale ? "Customer" : "Supplier"}</p>
            {e.party ? (
              <Link href={`/accounts/people/${e.party.id}`} className="font-medium text-brand-700 hover:underline">
                {e.party.name}
                {e.party.phone ? ` · ${e.party.phone}` : ""}
              </Link>
            ) : (
              <p>Walk-in (not saved)</p>
            )}
          </div>
        </Card>
      </div>
      <p className="mt-4 text-xs text-subtle">
        Entries can't be edited, so the records stay honest. To fix a mistake, cancel this one and enter it again.
      </p>
    </>
  );
}

function Row({ label, value, strong, tone }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className={`tabular ${strong ? "font-semibold" : ""} ${tone ?? ""}`}>{value}</dd>
    </div>
  );
}
