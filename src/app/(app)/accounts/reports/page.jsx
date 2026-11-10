// src/app/(app)/accounts/reports/page.jsx
import { Download } from "lucide-react";
import { formatDay, payMethods, resolveRange, taka } from "@/lib/accounts";
import { getReport } from "@/server/queries/accounts";
import { requireOwner } from "@/server/session";
import { RangePicker, Stat } from "@/components/accounts/bits";
import { PrintButton } from "@/components/print/print-button";
import { buttonClass } from "@/components/ui/button";
import { Card, CardHeader, PageHeader } from "@/components/ui/misc";

export const metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }) {
  await requireOwner();
  const sp = await searchParams;
  const r = resolveRange(sp, "month");
  const rep = await getReport(r.from, r.to);
  const t = rep.totals;
  const qs = new URLSearchParams({ range: r.range, ...(r.range === "custom" ? { from: r.from, to: r.to } : {}) });

  return (
    <>
      <PageHeader
        title="Reports"
        bangla="রিপোর্ট"
        description={r.label}
        action={
          <div className="flex flex-wrap gap-2 print:hidden">
            <a href={`/accounts/reports/export?${qs}`} className={buttonClass({ variant: "outline", size: "sm" })}>
              <Download className="h-3.5 w-3.5" /> Excel (CSV)
            </a>
            <PrintButton />
          </div>
        }
      />
      <div className="print:hidden">
        <RangePicker range={r.range} from={r.from} to={r.to} />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Sales"
          value={taka(t.sales)}
          hint={`${t.salesCount} sale${t.salesCount === 1 ? "" : "s"}${t.discount ? ` · ${taka(t.discount)} discount given` : ""}`}
          tone="good"
        />
        <Stat
          label="Expenses"
          value={taka(t.expenses)}
          hint={`${t.expensesCount} expense${t.expensesCount === 1 ? "" : "s"}`}
          tone={t.expenses ? "bad" : undefined}
        />
        <Stat label="Profit" value={taka(t.profit)} hint="Sales − expenses" tone={t.profit >= 0 ? "good" : "bad"} />
        <Stat label="Cash in hand" value={taka(t.net)} hint={`Came in ${taka(t.cashIn)} · went out ${taka(t.cashOut)}`} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="New baki given" value={taka(t.newDues)} tone={t.newDues ? "warn" : undefined} />
        <Stat label="Baki collected" value={taka(t.duesCollected)} />
        <Stat
          label="Customers owe now"
          value={taka(rep.outstanding.receivable)}
          hint="All time"
          tone={rep.outstanding.receivable ? "warn" : undefined}
        />
        <Stat
          label="Shop owes now"
          value={taka(rep.outstanding.payable)}
          hint="All time"
          tone={rep.outstanding.payable ? "bad" : undefined}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Sales by service" />
          <SimpleTable
            head={["Service", "Qty", "Amount"]}
            rows={rep.byService.map((s) => [s.name, s.qty, taka(s.amount)])}
            empty="No sales."
            note={t.discount ? `Before ${taka(t.discount)} discount.` : null}
          />
        </Card>
        <Card>
          <CardHeader title="Expenses by type" />
          <SimpleTable
            head={["Type", "Entries", "Amount"]}
            rows={rep.byExpense.map((s) => [s.name, s.count, taka(s.amount)])}
            empty="No expenses."
          />
        </Card>
        <Card>
          <CardHeader
            title="Money by payment method"
            description="What actually came in and went out, including baki payments."
          />
          <SimpleTable
            head={["Method", "In", "Out", "Net"]}
            rows={rep.byMethod.map((m) => [payMethods[m.method], taka(m.in), taka(m.out), taka(m.in - m.out)])}
            empty="No money moved."
          />
        </Card>
        <Card>
          <CardHeader title="By staff" />
          <SimpleTable
            head={["Person", "Sales", "Sold", "Expenses entered"]}
            rows={rep.byStaff.map((s) => [s.name, s.sales, taka(s.amount), taka(s.expenses)])}
            empty="Nothing entered."
          />
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Day by day" />
        <SimpleTable
          head={["Date", "Sales", "Expenses", "Profit", "Cash in", "Cash out", "Cash net"]}
          rows={rep.daily.map((d) => [
            formatDay(d.date, { weekday: true }),
            taka(d.sales),
            taka(d.expenses),
            taka(d.profit),
            taka(d.cashIn),
            taka(d.cashOut),
            taka(d.net),
          ])}
          empty="No entries in these dates."
        />
      </Card>
      <p className="mt-4 text-xs text-subtle">
        Profit counts a sale on the day it's made, even if part is still baki. Cash in hand counts only money that actually came
        in or went out (including baki collected later). Cancelled entries are left out.
      </p>
    </>
  );
}

function SimpleTable({ head, rows, empty, note }) {
  if (!rows.length) return <p className="px-5 py-6 text-center text-sm text-subtle">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-xs text-muted">
            {head.map((h, i) => (
              <th key={h} className={`px-4 py-2 font-medium ${i ? "text-right" : "text-left"}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={`px-4 py-2 ${j ? "tabular text-right whitespace-nowrap" : ""}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {note ? <p className="px-4 py-2 text-xs text-subtle">{note}</p> : null}
    </div>
  );
}
