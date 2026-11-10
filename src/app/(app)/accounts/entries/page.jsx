// src/app/(app)/accounts/entries/page.jsx
import Link from "next/link";
import { payMethods, resolveRange, taka } from "@/lib/accounts";
import { listEntries, listStaff, PAGE_SIZE } from "@/server/queries/accounts";
import { requireUser } from "@/server/session";
import { Pager } from "@/components/accounts/bits";
import { EntryFilters } from "@/components/accounts/entry-filters";
import { EntryTable } from "@/components/accounts/entry-table";
import { buttonClass } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/misc";

export const metadata = { title: "Sales & expenses" };

export default async function EntriesPage({ searchParams }) {
  const user = await requireUser();
  const sp = await searchParams;
  const r = resolveRange(sp, "today");
  const kind = ["income", "expense"].includes(sp.kind) ? sp.kind : "";
  const method = Object.hasOwn(payMethods, sp.method) ? sp.method : "";
  const status = ["voided", "all"].includes(sp.status) ? sp.status : "active";
  const isOwner = user.role === "owner";
  const staff = isOwner && typeof sp.staff === "string" ? sp.staff : "";
  const q = typeof sp.q === "string" ? sp.q.slice(0, 80) : "";
  const [data, staffList] = await Promise.all([
    listEntries({ from: r.from, to: r.to, kind, method, staff, status, q, page: sp.page }),
    isOwner ? listStaff() : Promise.resolve(null),
  ]);

  return (
    <>
      <PageHeader
        title="Sales & expenses"
        bangla="লেনদেন"
        description={r.label}
        action={
          <div className="flex gap-2">
            <Link href="/accounts/sale" className={buttonClass({ variant: "accent", size: "sm" })}>
              New sale
            </Link>
            <Link href="/accounts/expense" className={buttonClass({ variant: "outline", size: "sm" })}>
              New expense
            </Link>
          </div>
        }
      />
      <EntryFilters
        range={r.range}
        from={r.from}
        to={r.to}
        kind={kind}
        method={method}
        staff={staff}
        status={status}
        q={q}
        staffList={staffList}
      />
      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <span>
          Sales <strong className="tabular text-success">{taka(data.income)}</strong>
        </span>
        <span>
          Expenses <strong className="tabular text-danger">{taka(data.expense)}</strong>
        </span>
        <span className="text-muted">{data.total} entries</span>
      </div>
      <Card className="mt-3">
        <EntryTable rows={data.rows} empty="No entries for these filters." />
        <Pager page={data.page} total={data.total} pageSize={PAGE_SIZE} />
      </Card>
    </>
  );
}
