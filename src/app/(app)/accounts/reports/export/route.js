// src/app/(app)/accounts/reports/export/route.js
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { entries, parties, payments, users } from "@/db/schema";
import { entryDue, formatTime, payMethods, resolveRange, round2 } from "@/lib/accounts";
import { csvResponse } from "@/server/csv";
import { logError } from "@/server/errors";
import { summariseItems } from "@/server/queries/accounts";
import { getOwner } from "@/server/session";

/** Every sale, expense and payment in the range, for Excel. Owner only. */
export async function GET(request) {
  if (!(await getOwner())) return new Response("Only the shop owner can download reports.", { status: 403 });
  const sp = Object.fromEntries(new URL(request.url).searchParams);
  const r = resolveRange(sp, "month");
  const by = alias(users, "by_user");
  try {
    const [es, ps] = await Promise.all([
      db
        .select({ e: entries, party: parties.name, phone: parties.phone, by: by.name })
        .from(entries)
        .leftJoin(parties, eq(entries.partyId, parties.id))
        .leftJoin(by, eq(entries.createdBy, by.id))
        .where(and(gte(entries.date, r.from), lte(entries.date, r.to)))
        .orderBy(asc(entries.date), asc(entries.id)),
      db
        .select({ p: payments, party: parties.name, phone: parties.phone, by: by.name })
        .from(payments)
        .innerJoin(parties, eq(payments.partyId, parties.id))
        .leftJoin(by, eq(payments.createdBy, by.id))
        .where(and(gte(payments.date, r.from), lte(payments.date, r.to)))
        .orderBy(asc(payments.date), asc(payments.id)),
    ]);
    const rows = [
      ...es.map(({ e, party, phone, by: who }) => [
        e.date,
        formatTime(e.createdAt),
        e.kind === "income" ? "Sale" : "Expense",
        e.id,
        e.kind === "income" ? summariseItems(e.items) : e.category,
        party ?? "",
        phone ?? "",
        round2(Number(e.total) - Number(e.discount)),
        round2(Number(e.discount)),
        round2(Number(e.paid)),
        entryDue(e),
        payMethods[e.method],
        e.note,
        who ?? "",
        e.voidedAt ? `Cancelled: ${e.voidReason ?? ""}` : "",
      ]),
      ...ps.map(({ p, party, phone, by: who }) => [
        p.date,
        formatTime(p.createdAt),
        p.direction === "in" ? "Payment received" : "Payment given",
        `P${p.id}`,
        "",
        party,
        phone,
        round2(Number(p.amount)),
        0,
        round2(Number(p.amount)),
        0,
        payMethods[p.method],
        p.note,
        who ?? "",
        p.voidedAt ? `Cancelled: ${p.voidReason ?? ""}` : "",
      ]),
    ].sort((a, b) => (a[0] === b[0] ? 0 : a[0] < b[0] ? -1 : 1));
    return csvResponse(
      `accounts-${r.from}-to-${r.to}.csv`,
      [
        "Date",
        "Time",
        "Type",
        "No.",
        "Details",
        "Customer / supplier",
        "Phone",
        "Amount",
        "Discount",
        "Paid",
        "Due",
        "Method",
        "Note",
        "Entered by",
        "Status",
      ],
      rows,
    );
  } catch (err) {
    logError("accountsExport", err);
    return new Response("Couldn't make the file. Try again.", { status: 500 });
  }
}
