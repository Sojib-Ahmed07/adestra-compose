// src/server/queries/accounts.js
import "server-only";
import { cache } from "react";
import { and, asc, desc, eq, gte, ilike, isNull, lte, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { entries, parties, payments, priceItems, settings, users } from "@/db/schema";
import { defaultExpenseTypes, entryDue, round2 } from "@/lib/accounts";

export const PAGE_SIZE = 50;
const n = (v) => round2(Number(v ?? 0));

// ---------- Settings & price list ----------

export const getAccountSettings = cache(async () => {
  const [row] = await db.select().from(settings).where(eq(settings.key, "accounts"));
  const v = row?.value ?? {};
  return {
    expenseTypes: Array.isArray(v.expenseTypes) && v.expenseTypes.length ? v.expenseTypes : defaultExpenseTypes,
    receiptNote: typeof v.receiptNote === "string" ? v.receiptNote : "Thank you. Please come again.",
  };
});

export async function listPriceItems({ activeOnly = false } = {}) {
  const rows = await db
    .select()
    .from(priceItems)
    .where(activeOnly ? eq(priceItems.active, true) : undefined)
    .orderBy(asc(priceItems.sortOrder), asc(priceItems.id));
  return rows.map((r) => ({ id: r.id, name: r.name, price: n(r.price), unit: r.unit, active: r.active, sortOrder: r.sortOrder }));
}

// ---------- Balances ----------

/** SQL pieces: what a party owes us (receivable) and what we owe them (payable). */
const receivableSql = sql`(
  coalesce((select sum(e.total - e.discount - e.paid) from ${entries} e where e.party_id = ${parties.id} and e.kind = 'income' and e.voided_at is null), 0)
  - coalesce((select sum(p.amount) from ${payments} p where p.party_id = ${parties.id} and p.direction = 'in' and p.voided_at is null), 0)
)`;
const payableSql = sql`(
  coalesce((select sum(e.total - e.discount - e.paid) from ${entries} e where e.party_id = ${parties.id} and e.kind = 'expense' and e.voided_at is null), 0)
  - coalesce((select sum(p.amount) from ${payments} p where p.party_id = ${parties.id} and p.direction = 'out' and p.voided_at is null), 0)
)`;

const partyRow = (r) => ({
  id: r.id,
  kind: r.kind,
  name: r.name,
  phone: r.phone,
  address: r.address,
  note: r.note,
  archived: r.archived,
  receivable: n(r.receivable),
  payable: n(r.payable),
});

/**
 * Customers / suppliers with balances.
 * @param {{ q?: string, kind?: "customer" | "supplier" | "", show?: "all" | "owes" | "owed", page?: number }} f
 */
export async function listParties(f = {}) {
  const conds = [eq(parties.archived, false)];
  if (f.kind) conds.push(eq(parties.kind, f.kind));
  if (f.q?.trim()) {
    const q = `%${f.q.trim()}%`;
    conds.push(or(ilike(parties.name, q), ilike(parties.phone, q)));
  }
  if (f.show === "owes") conds.push(sql`${receivableSql} > 0`);
  if (f.show === "owed") conds.push(sql`${payableSql} > 0`);
  const page = Math.max(1, Number(f.page) || 1);
  const rows = await db
    .select({
      id: parties.id,
      kind: parties.kind,
      name: parties.name,
      phone: parties.phone,
      address: parties.address,
      note: parties.note,
      archived: parties.archived,
      receivable: receivableSql,
      payable: payableSql,
      total: sql`count(*) over()`,
    })
    .from(parties)
    .where(and(...conds))
    .orderBy(f.show === "owes" ? desc(receivableSql) : f.show === "owed" ? desc(payableSql) : asc(parties.name))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);
  return { rows: rows.map(partyRow), total: Number(rows[0]?.total ?? 0), page };
}

/** Quick search for the customer/supplier picker (top 8). */
export async function searchParties(q, kind) {
  const conds = [eq(parties.archived, false)];
  if (kind) conds.push(eq(parties.kind, kind));
  if (q?.trim()) {
    const like = `%${q.trim()}%`;
    conds.push(or(ilike(parties.name, like), ilike(parties.phone, like)));
  }
  const rows = await db
    .select({
      id: parties.id,
      kind: parties.kind,
      name: parties.name,
      phone: parties.phone,
      address: parties.address,
      note: parties.note,
      archived: parties.archived,
      receivable: receivableSql,
      payable: payableSql,
    })
    .from(parties)
    .where(and(...conds))
    .orderBy(asc(parties.name))
    .limit(8);
  return rows.map(partyRow);
}

export async function getParty(id) {
  const [r] = await db
    .select({
      id: parties.id,
      kind: parties.kind,
      name: parties.name,
      phone: parties.phone,
      address: parties.address,
      note: parties.note,
      archived: parties.archived,
      receivable: receivableSql,
      payable: payableSql,
    })
    .from(parties)
    .where(eq(parties.id, id));
  return r ? partyRow(r) : null;
}

/**
 * Everything that changed a party's balance, oldest first, with a running balance.
 * Positive balance = they owe us; negative = we owe them.
 */
export async function getPartyLedger(id) {
  const [es, ps] = await Promise.all([
    db.select().from(entries).where(eq(entries.partyId, id)).orderBy(asc(entries.date), asc(entries.createdAt)),
    db.select().from(payments).where(eq(payments.partyId, id)).orderBy(asc(payments.date), asc(payments.createdAt)),
  ]);
  const lines = [
    ...es.map((e) => ({
      type: "entry",
      id: e.id,
      date: e.date,
      at: e.createdAt,
      kind: e.kind,
      label: e.kind === "income" ? `Sale #${e.id}` : `Expense #${e.id}${e.category ? ` · ${e.category}` : ""}`,
      detail: e.kind === "income" ? summariseItems(e.items) : e.note,
      total: n(e.total) - n(e.discount),
      paid: n(e.paid),
      // effect on "they owe us": a sale's unpaid part adds; an expense's unpaid part means we owe them.
      change: e.kind === "income" ? entryDue(e) : -entryDue(e),
      voided: Boolean(e.voidedAt),
    })),
    ...ps.map((p) => ({
      type: "payment",
      id: p.id,
      date: p.date,
      at: p.createdAt,
      kind: p.direction,
      label: p.direction === "in" ? "Payment received" : "Payment given",
      detail: p.note,
      total: n(p.amount),
      paid: n(p.amount),
      method: p.method,
      change: p.direction === "in" ? -n(p.amount) : n(p.amount),
      voided: Boolean(p.voidedAt),
    })),
  ].sort((a, b) => (a.date === b.date ? new Date(a.at) - new Date(b.at) : a.date < b.date ? -1 : 1));
  let bal = 0;
  for (const l of lines) {
    if (!l.voided) bal = round2(bal + l.change);
    l.balance = bal;
  }
  return lines;
}

export function summariseItems(items) {
  if (!Array.isArray(items) || !items.length) return "";
  const first = items
    .slice(0, 3)
    .map((i) => (Number(i.qty) > 1 ? `${i.name} × ${i.qty}` : i.name))
    .join(", ");
  return items.length > 3 ? `${first} +${items.length - 3} more` : first;
}

// ---------- Entries ----------

const creator = alias(users, "creator");
const voider = alias(users, "voider");

/**
 * @param {{ from: string, to: string, kind?: string, method?: string, partyId?: number, q?: string, staff?: string,
 *   status?: "active" | "voided" | "all", page?: number }} f
 */
export async function listEntries(f) {
  const conds = [gte(entries.date, f.from), lte(entries.date, f.to)];
  if (f.kind) conds.push(eq(entries.kind, f.kind));
  if (f.method) conds.push(eq(entries.method, f.method));
  if (f.partyId) conds.push(eq(entries.partyId, f.partyId));
  if (f.staff) conds.push(eq(entries.createdBy, f.staff));
  if (f.status === "voided") conds.push(sql`${entries.voidedAt} is not null`);
  else if (f.status !== "all") conds.push(isNull(entries.voidedAt));
  if (f.q?.trim()) {
    const q = `%${f.q.trim()}%`;
    const asNumber = Number(f.q.trim().replace(/^#/, ""));
    conds.push(
      or(
        ilike(entries.note, q),
        ilike(entries.category, q),
        ilike(parties.name, q),
        ilike(parties.phone, q),
        sql`${entries.items}::text ilike ${q}`,
        Number.isInteger(asNumber) && asNumber > 0 ? eq(entries.id, asNumber) : undefined,
      ),
    );
  }
  const page = Math.max(1, Number(f.page) || 1);
  const where = and(...conds);
  const [rows, [sum]] = await Promise.all([
    db
      .select({ e: entries, partyName: parties.name, partyPhone: parties.phone, by: creator.name })
      .from(entries)
      .leftJoin(parties, eq(entries.partyId, parties.id))
      .leftJoin(creator, eq(entries.createdBy, creator.id))
      .where(where)
      .orderBy(desc(entries.date), desc(entries.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({
        count: sql`count(*)`,
        income: sql`coalesce(sum(case when ${entries.kind} = 'income' and ${entries.voidedAt} is null then ${entries.total} - ${entries.discount} end), 0)`,
        expense: sql`coalesce(sum(case when ${entries.kind} = 'expense' and ${entries.voidedAt} is null then ${entries.total} end), 0)`,
      })
      .from(entries)
      .leftJoin(parties, eq(entries.partyId, parties.id))
      .where(where),
  ]);
  return {
    rows: rows.map(({ e, partyName, partyPhone, by }) => entryRow(e, { partyName, partyPhone, by })),
    total: Number(sum.count),
    income: n(sum.income),
    expense: n(sum.expense),
    page,
  };
}

function entryRow(e, extra = {}) {
  return {
    id: e.id,
    date: e.date,
    kind: e.kind,
    partyId: e.partyId,
    items: Array.isArray(e.items) ? e.items : [],
    summary: e.kind === "income" ? summariseItems(e.items) : e.category,
    category: e.category,
    total: n(e.total),
    discount: n(e.discount),
    paid: n(e.paid),
    due: entryDue(e),
    method: e.method,
    note: e.note,
    createdBy: e.createdBy,
    createdAt: e.createdAt.toISOString(),
    voidedAt: e.voidedAt ? e.voidedAt.toISOString() : null,
    voidReason: e.voidReason,
    ...extra,
  };
}

export async function getEntry(id) {
  const [r] = await db
    .select({ e: entries, party: parties, by: creator.name, voidedByName: voider.name })
    .from(entries)
    .leftJoin(parties, eq(entries.partyId, parties.id))
    .leftJoin(creator, eq(entries.createdBy, creator.id))
    .leftJoin(voider, eq(entries.voidedBy, voider.id))
    .where(eq(entries.id, id));
  if (!r) return null;
  return {
    ...entryRow(r.e, { by: r.by, voidedByName: r.voidedByName }),
    party: r.party
      ? { id: r.party.id, name: r.party.name, phone: r.party.phone, address: r.party.address, kind: r.party.kind }
      : null,
  };
}

export async function getPayment(id) {
  const [r] = await db
    .select({ p: payments, party: parties, by: creator.name })
    .from(payments)
    .innerJoin(parties, eq(payments.partyId, parties.id))
    .leftJoin(creator, eq(payments.createdBy, creator.id))
    .where(eq(payments.id, id));
  if (!r) return null;
  return {
    id: r.p.id,
    date: r.p.date,
    direction: r.p.direction,
    amount: n(r.p.amount),
    method: r.p.method,
    note: r.p.note,
    createdBy: r.p.createdBy,
    createdAt: r.p.createdAt.toISOString(),
    voidedAt: r.p.voidedAt ? r.p.voidedAt.toISOString() : null,
    by: r.by,
    party: { id: r.party.id, name: r.party.name, phone: r.party.phone, address: r.party.address },
  };
}

// ---------- Overview & reports ----------

/** Totals for a date range. Sales are counted when made (after discount); cash counts money that actually moved. */
async function totals(from, to) {
  const [[e], [p]] = await Promise.all([
    db
      .select({
        sales: sql`coalesce(sum(case when kind = 'income' then total - discount end), 0)`,
        salesCount: sql`count(*) filter (where kind = 'income')`,
        discount: sql`coalesce(sum(case when kind = 'income' then discount end), 0)`,
        salesPaid: sql`coalesce(sum(case when kind = 'income' then paid end), 0)`,
        expenses: sql`coalesce(sum(case when kind = 'expense' then total end), 0)`,
        expensesCount: sql`count(*) filter (where kind = 'expense')`,
        expensesPaid: sql`coalesce(sum(case when kind = 'expense' then paid end), 0)`,
      })
      .from(entries)
      .where(and(gte(entries.date, from), lte(entries.date, to), isNull(entries.voidedAt))),
    db
      .select({
        received: sql`coalesce(sum(case when direction = 'in' then amount end), 0)`,
        given: sql`coalesce(sum(case when direction = 'out' then amount end), 0)`,
      })
      .from(payments)
      .where(and(gte(payments.date, from), lte(payments.date, to), isNull(payments.voidedAt))),
  ]);
  const sales = n(e.sales);
  const expenses = n(e.expenses);
  const cashIn = round2(n(e.salesPaid) + n(p.received));
  const cashOut = round2(n(e.expensesPaid) + n(p.given));
  return {
    sales,
    salesCount: Number(e.salesCount),
    discount: n(e.discount),
    expenses,
    expensesCount: Number(e.expensesCount),
    profit: round2(sales - expenses),
    newDues: round2(sales - n(e.salesPaid)),
    duesCollected: n(p.received),
    supplierDues: round2(expenses - n(e.expensesPaid)),
    supplierPaid: n(p.given),
    cashIn,
    cashOut,
    net: round2(cashIn - cashOut),
  };
}

/** Everyone's outstanding balances, summed. */
async function outstanding() {
  const [r] = await db
    .select({
      receivable: sql`coalesce(sum(greatest(${receivableSql}, 0)), 0)`,
      payable: sql`coalesce(sum(greatest(${payableSql}, 0)), 0)`,
      owingCount: sql`count(*) filter (where ${receivableSql} > 0)`,
    })
    .from(parties);
  return { receivable: n(r.receivable), payable: n(r.payable), owingCount: Number(r.owingCount) };
}

export async function getOverview(today) {
  const [t, o, recent] = await Promise.all([
    totals(today, today),
    outstanding(),
    db
      .select({ e: entries, partyName: parties.name, by: creator.name })
      .from(entries)
      .leftJoin(parties, eq(entries.partyId, parties.id))
      .leftJoin(creator, eq(entries.createdBy, creator.id))
      .orderBy(desc(entries.id))
      .limit(10),
  ]);
  return { today: t, outstanding: o, recent: recent.map(({ e, partyName, by }) => entryRow(e, { partyName, by })) };
}

/** Full report for a range (owner). */
export async function getReport(from, to) {
  const live = and(gte(entries.date, from), lte(entries.date, to), isNull(entries.voidedAt));
  const livePay = and(gte(payments.date, from), lte(payments.date, to), isNull(payments.voidedAt));
  const [t, o, byService, byExpense, byMethodE, byMethodP, byStaff, daily, dailyPay] = await Promise.all([
    totals(from, to),
    outstanding(),
    db.execute(sql`
      select item->>'name' as name, sum((item->>'qty')::numeric) as qty, sum((item->>'amount')::numeric) as amount
      from ${entries}, jsonb_array_elements(${entries.items}) as item
      where ${entries.kind} = 'income' and ${entries.date} between ${from} and ${to} and ${entries.voidedAt} is null
      group by 1 order by 3 desc`),
    db
      .select({ name: entries.category, count: sql`count(*)`, amount: sql`sum(${entries.total})` })
      .from(entries)
      .where(and(live, eq(entries.kind, "expense")))
      .groupBy(entries.category)
      .orderBy(desc(sql`sum(${entries.total})`)),
    db
      .select({
        method: entries.method,
        in: sql`coalesce(sum(case when ${entries.kind} = 'income' then ${entries.paid} end), 0)`,
        out: sql`coalesce(sum(case when ${entries.kind} = 'expense' then ${entries.paid} end), 0)`,
      })
      .from(entries)
      .where(live)
      .groupBy(entries.method),
    db
      .select({
        method: payments.method,
        in: sql`coalesce(sum(case when ${payments.direction} = 'in' then ${payments.amount} end), 0)`,
        out: sql`coalesce(sum(case when ${payments.direction} = 'out' then ${payments.amount} end), 0)`,
      })
      .from(payments)
      .where(livePay)
      .groupBy(payments.method),
    db
      .select({
        name: creator.name,
        sales: sql`count(*) filter (where ${entries.kind} = 'income')`,
        amount: sql`coalesce(sum(case when ${entries.kind} = 'income' then ${entries.total} - ${entries.discount} end), 0)`,
        expenses: sql`coalesce(sum(case when ${entries.kind} = 'expense' then ${entries.total} end), 0)`,
      })
      .from(entries)
      .leftJoin(creator, eq(entries.createdBy, creator.id))
      .where(live)
      .groupBy(creator.name)
      .orderBy(desc(sql`coalesce(sum(case when ${entries.kind} = 'income' then ${entries.total} - ${entries.discount} end), 0)`)),
    db
      .select({
        date: entries.date,
        sales: sql`coalesce(sum(case when ${entries.kind} = 'income' then ${entries.total} - ${entries.discount} end), 0)`,
        expenses: sql`coalesce(sum(case when ${entries.kind} = 'expense' then ${entries.total} end), 0)`,
        cashIn: sql`coalesce(sum(case when ${entries.kind} = 'income' then ${entries.paid} end), 0)`,
        cashOut: sql`coalesce(sum(case when ${entries.kind} = 'expense' then ${entries.paid} end), 0)`,
      })
      .from(entries)
      .where(live)
      .groupBy(entries.date),
    db
      .select({
        date: payments.date,
        in: sql`coalesce(sum(case when ${payments.direction} = 'in' then ${payments.amount} end), 0)`,
        out: sql`coalesce(sum(case when ${payments.direction} = 'out' then ${payments.amount} end), 0)`,
      })
      .from(payments)
      .where(livePay)
      .groupBy(payments.date),
  ]);

  const methods = {};
  for (const r of [...byMethodE, ...byMethodP]) {
    methods[r.method] ??= { method: r.method, in: 0, out: 0 };
    methods[r.method].in = round2(methods[r.method].in + n(r.in));
    methods[r.method].out = round2(methods[r.method].out + n(r.out));
  }
  const days = {};
  for (const r of daily)
    days[r.date] = { date: r.date, sales: n(r.sales), expenses: n(r.expenses), cashIn: n(r.cashIn), cashOut: n(r.cashOut) };
  for (const r of dailyPay) {
    days[r.date] ??= { date: r.date, sales: 0, expenses: 0, cashIn: 0, cashOut: 0 };
    days[r.date].cashIn = round2(days[r.date].cashIn + n(r.in));
    days[r.date].cashOut = round2(days[r.date].cashOut + n(r.out));
  }

  return {
    from,
    to,
    totals: t,
    outstanding: o,
    byService: (byService.rows ?? byService).map((r) => ({ name: r.name, qty: n(r.qty), amount: n(r.amount) })),
    byExpense: byExpense.map((r) => ({ name: r.name || "Other", count: Number(r.count), amount: n(r.amount) })),
    byMethod: Object.values(methods).sort((a, b) => b.in + b.out - (a.in + a.out)),
    byStaff: byStaff.map((r) => ({
      name: r.name || "Removed person",
      sales: Number(r.sales),
      amount: n(r.amount),
      expenses: n(r.expenses),
    })),
    daily: Object.values(days)
      .map((d) => ({ ...d, profit: round2(d.sales - d.expenses), net: round2(d.cashIn - d.cashOut) }))
      .sort((a, b) => (a.date < b.date ? 1 : -1)),
  };
}

/** People who can appear in the "staff" filter. */
export async function listStaff() {
  return db.select({ id: users.id, name: users.name }).from(users).orderBy(asc(users.name));
}
