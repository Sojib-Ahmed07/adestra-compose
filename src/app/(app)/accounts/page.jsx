// src/app/(app)/accounts/page.jsx
import Link from "next/link";
import { CircleArrowDown, CircleArrowUp, HandCoins } from "lucide-react";
import { formatDay, taka, todayDhaka } from "@/lib/accounts";
import { getOverview } from "@/server/queries/accounts";
import { requireUser } from "@/server/session";
import { Stat } from "@/components/accounts/bits";
import { EntryTable } from "@/components/accounts/entry-table";
import { buttonClass } from "@/components/ui/button";
import { Card, CardHeader, PageHeader } from "@/components/ui/misc";

export const metadata = { title: "Accounts" };

export default async function AccountsPage() {
  const user = await requireUser();
  const today = todayDhaka();
  const { today: t, outstanding: o, recent } = await getOverview(today);
  const isOwner = user.role === "owner";

  return (
    <>
      <PageHeader
        title="Accounts"
        bangla="হিসাব"
        description={`Today, ${formatDay(today, { weekday: true })}`}
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/accounts/sale" className={buttonClass({ variant: "accent" })}>
              <CircleArrowDown className="h-4 w-4" /> New sale
            </Link>
            <Link href="/accounts/expense" className={buttonClass({ variant: "outline" })}>
              <CircleArrowUp className="h-4 w-4" /> New expense
            </Link>
            <Link href="/accounts/people?show=owes" className={buttonClass({ variant: "outline" })}>
              <HandCoins className="h-4 w-4" /> Collect baki
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Sales today"
          value={taka(t.sales)}
          hint={`${t.salesCount} sale${t.salesCount === 1 ? "" : "s"}${t.discount ? ` · ${taka(t.discount)} discount` : ""}`}
          tone="good"
        />
        <Stat
          label="Expenses today"
          value={taka(t.expenses)}
          hint={`${t.expensesCount} expense${t.expensesCount === 1 ? "" : "s"}`}
          tone={t.expenses ? "bad" : undefined}
        />
        {isOwner ? (
          <Stat label="Profit today" value={taka(t.profit)} hint="Sales − expenses" tone={t.profit >= 0 ? "good" : "bad"} />
        ) : (
          <Stat label="New baki today" value={taka(t.newDues)} tone={t.newDues ? "warn" : undefined} />
        )}
        <Stat label="Cash in hand today" value={taka(t.net)} hint={`In ${taka(t.cashIn)} · out ${taka(t.cashOut)}`} />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Stat
          label="Customers owe you (baki)"
          value={taka(o.receivable)}
          hint={o.owingCount ? `${o.owingCount} customer${o.owingCount === 1 ? "" : "s"} — tap to see who` : "Nobody owes you"}
          tone={o.receivable ? "warn" : undefined}
          href="/accounts/people?show=owes"
        />
        <Stat
          label="You owe suppliers"
          value={taka(o.payable)}
          tone={o.payable ? "bad" : undefined}
          href="/accounts/people?show=owed"
        />
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Latest entries"
          action={
            <Link href="/accounts/entries" className="text-sm font-medium text-brand-700 hover:underline">
              See all
            </Link>
          }
        />
        <EntryTable rows={recent} empty="No sales or expenses yet. Start with “New sale”." />
      </Card>
      {isOwner ? (
        <p className="mt-4 text-sm text-muted">
          Weekly and monthly totals are in{" "}
          <Link href="/accounts/reports" className="font-medium text-brand-700 hover:underline">
            Reports
          </Link>
          .
        </p>
      ) : null}
    </>
  );
}
