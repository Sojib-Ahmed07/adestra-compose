// src/app/(app)/accounts/people/[id]/page.jsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { Printer } from "lucide-react";
import { formatDay, payMethods, taka, todayDhaka } from "@/lib/accounts";
import { cn } from "@/lib/utils";
import { getParty, getPartyLedger } from "@/server/queries/accounts";
import { requireUser } from "@/server/session";
import { Stat } from "@/components/accounts/bits";
import { ArchivePartyButton, PartyFormButton, PaymentForm } from "@/components/accounts/party-forms";
import { VoidButton } from "@/components/accounts/void-button";
import { buttonClass } from "@/components/ui/button";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui/misc";

export async function generateMetadata({ params }) {
  const { id } = await params;
  const p = Number.isInteger(Number(id)) ? await getParty(Number(id)) : null;
  return { title: p?.name ?? "Not found" };
}

export default async function PartyPage({ params }) {
  const user = await requireUser();
  const { id } = await params;
  const num = Number(id);
  if (!Number.isInteger(num) || num < 1) notFound();
  const [party, ledger] = await Promise.all([getParty(num), getPartyLedger(num)]);
  if (!party) notFound();
  const today = todayDhaka();
  const isOwner = user.role === "owner";

  return (
    <>
      <PageHeader
        title={party.name}
        description={[party.kind === "customer" ? "Customer" : "Supplier", party.phone, party.address]
          .filter(Boolean)
          .join(" · ")}
        action={
          <div className="flex flex-wrap gap-2">
            <a
              href={`/print/statement/${party.id}`}
              target="_blank"
              rel="noopener"
              className={buttonClass({ variant: "outline", size: "sm" })}
            >
              <Printer className="h-3.5 w-3.5" /> Statement
            </a>
            <PartyFormButton party={party} variant="outline" />
            {isOwner && party.receivable === 0 && party.payable === 0 ? (
              <ArchivePartyButton id={party.id} name={party.name} />
            ) : null}
          </div>
        }
      />
      {party.archived ? (
        <p className="mb-4 rounded-lg bg-warn-50 px-3 py-2 text-sm text-warn">Removed from lists. Old records are kept.</p>
      ) : null}
      {party.note ? <p className="mb-4 text-sm text-muted">Note: {party.note}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Stat
          label="Owes the shop (baki)"
          value={taka(Math.max(0, party.receivable))}
          tone={party.receivable > 0 ? "warn" : undefined}
        />
        <Stat label="The shop owes them" value={taka(Math.max(0, party.payable))} tone={party.payable > 0 ? "bad" : undefined} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <Card className="min-w-0">
          <CardHeader
            title="History"
            description="Oldest first. Balance: + means they owe the shop, − means the shop owes them."
          />
          {ledger.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted">
                    <th className="px-4 py-2 font-medium">Date</th>
                    <th className="px-4 py-2 font-medium">What</th>
                    <th className="px-4 py-2 text-right font-medium">Amount</th>
                    <th className="px-4 py-2 text-right font-medium">Paid</th>
                    <th className="px-4 py-2 text-right font-medium">Balance</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {ledger.map((l) => (
                    <tr key={`${l.type}-${l.id}`} className={cn(l.voided && "text-subtle line-through decoration-ink-300")}>
                      <td className="px-4 py-2 whitespace-nowrap">{formatDay(l.date)}</td>
                      <td className="max-w-64 px-4 py-2">
                        {l.type === "entry" ? (
                          <Link href={`/accounts/entries/${l.id}`} className="font-medium text-brand-700 hover:underline">
                            {l.label}
                          </Link>
                        ) : (
                          <span className="font-medium">
                            {l.label} <span className="font-normal text-muted">· {payMethods[l.method]}</span>
                          </span>
                        )}
                        {l.voided ? <Badge className="ml-2">Cancelled</Badge> : null}
                        {l.detail ? <span className="block truncate text-xs text-muted">{l.detail}</span> : null}
                      </td>
                      <td className="tabular px-4 py-2 text-right">{l.type === "entry" ? taka(l.total) : "—"}</td>
                      <td className="tabular px-4 py-2 text-right">{taka(l.paid)}</td>
                      <td
                        className={cn(
                          "tabular px-4 py-2 text-right font-medium",
                          !l.voided && (l.balance > 0 ? "text-warn" : l.balance < 0 ? "text-danger" : ""),
                        )}
                      >
                        {l.balance === 0 ? "0" : taka(l.balance, { sign: true })}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {l.type === "payment" && !l.voided && isOwner ? (
                          <VoidButton id={l.id} what="payment" label="Cancel" />
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-5 py-8 text-center text-sm text-subtle">No sales, expenses or payments yet.</p>
          )}
        </Card>

        <div className="space-y-6">
          {party.receivable > 0 ? (
            <Card className="p-5">
              <h2 className="mb-3 text-sm font-semibold">Collect baki</h2>
              <PaymentForm party={party} direction="in" today={today} />
            </Card>
          ) : null}
          {party.payable > 0 ? (
            <Card className="p-5">
              <h2 className="mb-3 text-sm font-semibold">Pay what the shop owes</h2>
              <PaymentForm party={party} direction="out" today={today} />
            </Card>
          ) : null}
          {party.receivable <= 0 && party.payable <= 0 ? (
            <Card className="p-5 text-sm text-muted">
              All settled. New sales with baki will appear here.
              <Link href="/accounts/sale" className="mt-3 block font-medium text-brand-700 hover:underline">
                New sale
              </Link>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
