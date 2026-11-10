// src/app/(app)/accounts/people/page.jsx
import Link from "next/link";
import { taka } from "@/lib/accounts";
import { listParties, PAGE_SIZE } from "@/server/queries/accounts";
import { requireUser } from "@/server/session";
import { Pager } from "@/components/accounts/bits";
import { PartyFormButton, PeopleFilters } from "@/components/accounts/party-forms";
import { Badge, Card, PageHeader } from "@/components/ui/misc";

export const metadata = { title: "Customers & suppliers" };

export default async function PeoplePage({ searchParams }) {
  await requireUser();
  const sp = await searchParams;
  const show = ["owes", "owed"].includes(sp.show) ? sp.show : "all";
  const kind = ["customer", "supplier"].includes(sp.kind) ? sp.kind : "";
  const q = typeof sp.q === "string" ? sp.q.slice(0, 80) : "";
  const data = await listParties({ q, kind, show, page: sp.page });

  return (
    <>
      <PageHeader
        title="Customers & suppliers"
        bangla="দেনা পাওনা"
        description="Who owes the shop money (baki) and whom the shop owes."
        action={<PartyFormButton />}
      />
      <PeopleFilters q={q} kind={kind} show={show} />
      <Card className="mt-4">
        {data.rows.length ? (
          <ul className="divide-y divide-line">
            {data.rows.map((p) => (
              <li key={p.id}>
                <Link href={`/accounts/people/${p.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-paper">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-medium">
                      {p.name}
                      <Badge>{p.kind === "customer" ? "Customer" : "Supplier"}</Badge>
                    </p>
                    <p className="text-xs text-muted">{p.phone || "No phone"}</p>
                  </div>
                  {p.receivable > 0 ? (
                    <span className="text-right">
                      <span className="block text-xs text-muted">Owes you</span>
                      <span className="tabular font-semibold text-warn">{taka(p.receivable)}</span>
                    </span>
                  ) : null}
                  {p.payable > 0 ? (
                    <span className="text-right">
                      <span className="block text-xs text-muted">You owe</span>
                      <span className="tabular font-semibold text-danger">{taka(p.payable)}</span>
                    </span>
                  ) : null}
                  {p.receivable <= 0 && p.payable <= 0 ? <span className="text-xs text-subtle">Settled</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-8 text-center text-sm text-subtle">
            {show === "owes"
              ? "Nobody owes the shop money right now."
              : show === "owed"
                ? "The shop doesn't owe anyone."
                : "No customers or suppliers yet."}
          </p>
        )}
        <Pager page={data.page} total={data.total} pageSize={PAGE_SIZE} />
      </Card>
      <p className="mt-3 text-xs text-subtle">Customers are also added automatically when you leave baki on a sale.</p>
    </>
  );
}
