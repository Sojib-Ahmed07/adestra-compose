// src/components/accounts/entry-table.jsx
import Link from "next/link";
import { formatDay, formatTime, payMethods, taka } from "@/lib/accounts";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/misc";

/** List of sales/expenses. Works on phones (stacked) and desktops (table). */
export function EntryTable({ rows, showDate = true, empty = "Nothing here yet." }) {
  if (!rows.length) return <p className="px-5 py-8 text-center text-sm text-subtle">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-muted">
            <th className="px-4 py-2 font-medium">#</th>
            {showDate ? <th className="px-4 py-2 font-medium">Date</th> : null}
            <th className="px-4 py-2 font-medium">Details</th>
            <th className="px-4 py-2 font-medium">Customer / supplier</th>
            <th className="px-4 py-2 text-right font-medium">Amount</th>
            <th className="px-4 py-2 text-right font-medium">Due</th>
            <th className="px-4 py-2 font-medium">By</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => {
            const amount = r.kind === "income" ? r.total - r.discount : r.total;
            return (
              <tr key={r.id} className={cn("hover:bg-paper", r.voidedAt && "text-subtle line-through decoration-ink-300")}>
                <td className="px-4 py-2.5">
                  <Link href={`/accounts/entries/${r.id}`} className="font-medium text-brand-700 no-underline hover:underline">
                    {r.id}
                  </Link>
                </td>
                {showDate ? (
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {formatDay(r.date)}
                    <span className="block text-xs text-subtle">{formatTime(r.createdAt)}</span>
                  </td>
                ) : null}
                <td className="max-w-72 px-4 py-2.5">
                  <span className="flex items-center gap-2">
                    <Badge tone={r.kind === "income" ? "success" : "danger"}>{r.kind === "income" ? "Sale" : "Expense"}</Badge>
                    {r.voidedAt ? <Badge>Cancelled</Badge> : null}
                  </span>
                  <span className="mt-0.5 block truncate">{r.summary || r.note || "—"}</span>
                </td>
                <td className="px-4 py-2.5">
                  {r.partyId ? (
                    <Link href={`/accounts/people/${r.partyId}`} className="hover:underline">
                      {r.partyName}
                    </Link>
                  ) : (
                    <span className="text-subtle">Walk-in</span>
                  )}
                </td>
                <td
                  className={cn(
                    "tabular px-4 py-2.5 text-right font-medium whitespace-nowrap",
                    !r.voidedAt && (r.kind === "income" ? "text-success" : "text-danger"),
                  )}
                >
                  {r.kind === "income" ? "+" : "−"}
                  {taka(amount).replace("−", "")}
                  <span className="block text-xs font-normal text-subtle">{payMethods[r.method]}</span>
                </td>
                <td className="tabular px-4 py-2.5 text-right whitespace-nowrap">
                  {r.due > 0 ? <span className="text-warn">{taka(r.due)}</span> : <span className="text-subtle">—</span>}
                </td>
                <td className="px-4 py-2.5 text-muted">{r.by || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
