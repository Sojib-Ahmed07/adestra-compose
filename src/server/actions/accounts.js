// src/server/actions/accounts.js
"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { entries, parties, payments, priceItems, settings } from "@/db/schema";
import { dhakaDateOf, isISODate, payMethods, round2, todayDhaka } from "@/lib/accounts";
import { logError } from "../errors";
import { getParty, searchParties } from "../queries/accounts";
import { getCurrentUser, getOwner } from "../session";

const SIGNED_OUT = { ok: false, error: "Please sign in again." };
const NOT_OWNER = { ok: false, error: "Only the shop owner can do this." };

function fieldErrorsOf(error) {
  const out = {};
  for (const issue of error.issues) out[issue.path.join(".")] ??= issue.message;
  return out;
}

const refresh = () => revalidatePath("/accounts", "layout");

const money = (label, { min = 0 } = {}) =>
  z.coerce
    .number({ error: `Enter ${label}.` })
    .refine((v) => Number.isFinite(v), { error: `Enter ${label}.` })
    .refine((v) => v >= min, {
      error:
        min > 0
          ? `${label[0].toUpperCase() + label.slice(1)} must be more than 0.`
          : `${label[0].toUpperCase() + label.slice(1)} can't be negative.`,
    })
    .refine((v) => v <= 99_999_999, { error: "That amount is too large." })
    .transform(round2);

const dateField = z
  .string()
  .refine(isISODate, { error: "Choose a valid date." })
  .refine((d) => d <= todayDhaka(), { error: "The date can't be in the future." });

const methodField = z.enum(Object.keys(payMethods), { error: "Choose how it was paid." });

const newPartySchema = z.object({
  name: z.string().trim().min(1, { error: "Enter the name." }).max(120),
  phone: z.string().trim().max(40).default(""),
});

/** Find or create the party for a sale/expense. Returns id or null. */
async function resolveParty(tx, { partyId, newParty }, kind) {
  if (partyId) {
    const [p] = await tx.select({ id: parties.id }).from(parties).where(eq(parties.id, partyId));
    if (!p) throw new Error("PARTY_NOT_FOUND");
    return p.id;
  }
  if (newParty?.name?.trim()) {
    const np = newPartySchema.parse(newParty);
    // Same phone number already saved → use that person instead of a duplicate.
    if (np.phone) {
      const [same] = await tx
        .select({ id: parties.id })
        .from(parties)
        .where(and(eq(parties.phone, np.phone), eq(parties.archived, false)));
      if (same) return same.id;
    }
    const [created] = await tx.insert(parties).values({ kind, name: np.name, phone: np.phone }).returning({ id: parties.id });
    return created.id;
  }
  return null;
}

// ---------- Sales ----------

const itemSchema = z.object({
  name: z.string().trim().min(1, { error: "Each line needs a name." }).max(160),
  qty: z.coerce
    .number()
    .refine((v) => Number.isFinite(v) && v > 0, { error: "Quantity must be more than 0." })
    .refine((v) => v <= 100000, { error: "Quantity is too large." }),
  rate: money("the rate"),
});

const saleSchema = z.object({
  date: dateField,
  partyId: z.coerce.number().int().positive().nullable().optional(),
  newParty: newPartySchema.partial().nullable().optional(),
  items: z.array(itemSchema).min(1, { error: "Add at least one item." }).max(100),
  discount: money("the discount"),
  paid: money("the amount paid"),
  method: methodField,
  note: z.string().trim().max(500).default(""),
});

export async function saveSale(data) {
  const me = await getCurrentUser();
  if (!me) return SIGNED_OUT;
  const parsed = saleSchema.safeParse(data);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error), error: parsed.error.issues[0]?.message };
  const d = parsed.data;
  const items = d.items.map((i) => ({ name: i.name, qty: round2(i.qty), rate: i.rate, amount: round2(i.qty * i.rate) }));
  const total = round2(items.reduce((s, i) => s + i.amount, 0));
  if (d.discount > total) return { ok: false, fieldErrors: { discount: "The discount is more than the total." } };
  const net = round2(total - d.discount);
  if (d.paid > net) return { ok: false, fieldErrors: { paid: `Paid can't be more than ${net}. Give the change back.` } };
  const due = round2(net - d.paid);
  if (due > 0 && !d.partyId && !d.newParty?.name?.trim()) {
    return { ok: false, fieldErrors: { party: "To leave baki (unpaid amount), choose or add the customer." } };
  }
  try {
    const id = await db.transaction(async (tx) => {
      const partyId = await resolveParty(tx, d, "customer");
      const [row] = await tx
        .insert(entries)
        .values({
          date: d.date,
          kind: "income",
          partyId,
          items,
          category: "Sale",
          total,
          discount: d.discount,
          paid: d.paid,
          method: d.method,
          note: d.note,
          createdBy: me.id,
        })
        .returning({ id: entries.id });
      return row.id;
    });
    refresh();
    return { ok: true, id };
  } catch (err) {
    if (err?.message === "PARTY_NOT_FOUND")
      return { ok: false, fieldErrors: { party: "That customer was not found. Choose again." } };
    logError("saveSale", err);
    return { ok: false, error: "Couldn't save the sale. Try again." };
  }
}

// ---------- Expenses ----------

const expenseSchema = z.object({
  date: dateField,
  category: z.string().trim().min(1, { error: "Choose the expense type." }).max(80),
  amount: money("the amount", { min: 0.01 }),
  paid: money("the amount paid"),
  method: methodField,
  partyId: z.coerce.number().int().positive().nullable().optional(),
  newParty: newPartySchema.partial().nullable().optional(),
  note: z.string().trim().max(500).default(""),
});

export async function saveExpense(data) {
  const me = await getCurrentUser();
  if (!me) return SIGNED_OUT;
  const parsed = expenseSchema.safeParse(data);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error), error: parsed.error.issues[0]?.message };
  const d = parsed.data;
  if (d.paid > d.amount) return { ok: false, fieldErrors: { paid: "Paid can't be more than the amount." } };
  if (d.paid < d.amount && !d.partyId && !d.newParty?.name?.trim()) {
    return { ok: false, fieldErrors: { party: "To leave part unpaid, choose or add the supplier you owe." } };
  }
  try {
    const id = await db.transaction(async (tx) => {
      const partyId = await resolveParty(tx, d, "supplier");
      const [row] = await tx
        .insert(entries)
        .values({
          date: d.date,
          kind: "expense",
          partyId,
          items: [],
          category: d.category,
          total: d.amount,
          discount: 0,
          paid: d.paid,
          method: d.method,
          note: d.note,
          createdBy: me.id,
        })
        .returning({ id: entries.id });
      return row.id;
    });
    refresh();
    return { ok: true, id };
  } catch (err) {
    if (err?.message === "PARTY_NOT_FOUND")
      return { ok: false, fieldErrors: { party: "That supplier was not found. Choose again." } };
    logError("saveExpense", err);
    return { ok: false, error: "Couldn't save the expense. Try again." };
  }
}

// ---------- Cancel (void) ----------

const reasonSchema = z.string().trim().min(3, { error: "Write a short reason (at least 3 letters)." }).max(200);

/** Owners can cancel anything. Operators only their own, on the day it was entered. */
function canVoid(me, row) {
  if (me.role === "owner") return true;
  return row.createdBy === me.id && dhakaDateOf(row.createdAt) === todayDhaka();
}

export async function voidEntry(id, reason) {
  const me = await getCurrentUser();
  if (!me) return SIGNED_OUT;
  const r = reasonSchema.safeParse(reason);
  if (!r.success) return { ok: false, fieldErrors: { reason: r.error.issues[0].message } };
  try {
    const [row] = await db
      .select()
      .from(entries)
      .where(eq(entries.id, Number(id)));
    if (!row) return { ok: false, error: "Entry not found." };
    if (row.voidedAt) return { ok: false, error: "This entry is already cancelled." };
    if (!canVoid(me, row)) return { ok: false, error: "You can only cancel your own entries on the same day. Ask the owner." };
    await db
      .update(entries)
      .set({ voidedAt: new Date(), voidedBy: me.id, voidReason: r.data })
      .where(and(eq(entries.id, row.id), isNull(entries.voidedAt)));
    refresh();
    return { ok: true };
  } catch (err) {
    logError("voidEntry", err);
    return { ok: false, error: "Couldn't cancel. Try again." };
  }
}

// ---------- Payments (settle dues) ----------

const paymentSchema = z.object({
  partyId: z.coerce.number().int().positive(),
  direction: z.enum(["in", "out"]),
  amount: money("the amount", { min: 0.01 }),
  date: dateField,
  method: methodField,
  note: z.string().trim().max(300).default(""),
});

export async function savePayment(data) {
  const me = await getCurrentUser();
  if (!me) return SIGNED_OUT;
  const parsed = paymentSchema.safeParse(data);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error), error: parsed.error.issues[0]?.message };
  const d = parsed.data;
  try {
    const party = await getParty(d.partyId);
    if (!party) return { ok: false, error: "Customer not found." };
    const owed = d.direction === "in" ? party.receivable : party.payable;
    if (owed <= 0)
      return {
        ok: false,
        error: d.direction === "in" ? `${party.name} doesn't owe anything.` : `You don't owe ${party.name} anything.`,
      };
    if (d.amount > owed) return { ok: false, fieldErrors: { amount: `More than the due (${owed}). Enter ${owed} or less.` } };
    const [row] = await db
      .insert(payments)
      .values({
        partyId: d.partyId,
        direction: d.direction,
        amount: d.amount,
        date: d.date,
        method: d.method,
        note: d.note,
        createdBy: me.id,
      })
      .returning({ id: payments.id });
    refresh();
    return { ok: true, id: row.id };
  } catch (err) {
    logError("savePayment", err);
    return { ok: false, error: "Couldn't save the payment. Try again." };
  }
}

export async function voidPayment(id, reason) {
  const me = await getCurrentUser();
  if (!me) return SIGNED_OUT;
  const r = reasonSchema.safeParse(reason);
  if (!r.success) return { ok: false, fieldErrors: { reason: r.error.issues[0].message } };
  try {
    const [row] = await db
      .select()
      .from(payments)
      .where(eq(payments.id, Number(id)));
    if (!row) return { ok: false, error: "Payment not found." };
    if (row.voidedAt) return { ok: false, error: "This payment is already cancelled." };
    if (!canVoid(me, row)) return { ok: false, error: "You can only cancel your own payments on the same day. Ask the owner." };
    await db.update(payments).set({ voidedAt: new Date(), voidedBy: me.id, voidReason: r.data }).where(eq(payments.id, row.id));
    refresh();
    return { ok: true };
  } catch (err) {
    logError("voidPayment", err);
    return { ok: false, error: "Couldn't cancel. Try again." };
  }
}

// ---------- Customers & suppliers ----------

const partySchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  kind: z.enum(["customer", "supplier"]),
  name: z.string().trim().min(1, { error: "Enter the name." }).max(120),
  phone: z.string().trim().max(40).default(""),
  address: z.string().trim().max(300).default(""),
  note: z.string().trim().max(500).default(""),
});

export async function saveParty(data) {
  const me = await getCurrentUser();
  if (!me) return SIGNED_OUT;
  const parsed = partySchema.safeParse(data);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
  const { id, ...v } = parsed.data;
  try {
    if (v.phone) {
      const [same] = await db
        .select({ id: parties.id, name: parties.name })
        .from(parties)
        .where(and(eq(parties.phone, v.phone), eq(parties.archived, false), id ? sql`${parties.id} <> ${id}` : undefined));
      if (same) return { ok: false, fieldErrors: { phone: `${same.name} already has this number.` } };
    }
    let savedId = id;
    if (id)
      await db
        .update(parties)
        .set({ ...v, updatedAt: new Date() })
        .where(eq(parties.id, id));
    else [{ id: savedId }] = await db.insert(parties).values(v).returning({ id: parties.id });
    refresh();
    return { ok: true, id: savedId };
  } catch (err) {
    logError("saveParty", err);
    return { ok: false, error: "Couldn't save. Try again." };
  }
}

/** Hide someone from lists (only when they owe nothing and are owed nothing). Owner only. */
export async function archiveParty(id) {
  if (!(await getOwner())) return NOT_OWNER;
  try {
    const p = await getParty(Number(id));
    if (!p) return { ok: false, error: "Not found." };
    if (p.receivable !== 0 || p.payable !== 0)
      return { ok: false, error: "Settle the dues first. Only people with a zero balance can be removed." };
    await db.update(parties).set({ archived: true, updatedAt: new Date() }).where(eq(parties.id, p.id));
    refresh();
    return { ok: true };
  } catch (err) {
    logError("archiveParty", err);
    return { ok: false, error: "Couldn't remove. Try again." };
  }
}

/** Picker search (any signed-in person). */
export async function findParties(q, kind) {
  const me = await getCurrentUser();
  if (!me) return [];
  try {
    return await searchParties(String(q || "").slice(0, 60), kind === "customer" || kind === "supplier" ? kind : undefined);
  } catch (err) {
    logError("findParties", err);
    return [];
  }
}

// ---------- Price list ----------

const priceSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  name: z.string().trim().min(1, { error: "Enter the service name." }).max(120),
  price: money("the price"),
  unit: z.string().trim().max(40).default(""),
  active: z.boolean().default(true),
});

export async function savePriceItem(data) {
  if (!(await getOwner())) return NOT_OWNER;
  const parsed = priceSchema.safeParse(data);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
  const { id, ...v } = parsed.data;
  try {
    if (id) await db.update(priceItems).set(v).where(eq(priceItems.id, id));
    else {
      const [{ max }] = await db.select({ max: sql`coalesce(max(${priceItems.sortOrder}), 0)` }).from(priceItems);
      await db.insert(priceItems).values({ ...v, sortOrder: Number(max) + 1 });
    }
    refresh();
    return { ok: true };
  } catch (err) {
    logError("savePriceItem", err);
    return { ok: false, error: "Couldn't save. Try again." };
  }
}

/** Old sales keep their own copy of names and rates, so removing a service never changes past entries. */
export async function deletePriceItem(id) {
  if (!(await getOwner())) return NOT_OWNER;
  try {
    await db.delete(priceItems).where(eq(priceItems.id, Number(id)));
    refresh();
    return { ok: true };
  } catch (err) {
    logError("deletePriceItem", err);
    return { ok: false, error: "Couldn't remove. Try again." };
  }
}

export async function movePriceItem(id, direction) {
  if (!(await getOwner())) return NOT_OWNER;
  try {
    const list = await db.select({ id: priceItems.id }).from(priceItems).orderBy(asc(priceItems.sortOrder), asc(priceItems.id));
    const i = list.findIndex((x) => x.id === Number(id));
    const j = direction === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= list.length) return { ok: true };
    [list[i], list[j]] = [list[j], list[i]];
    await db.transaction(async (tx) => {
      for (let k = 0; k < list.length; k++)
        await tx
          .update(priceItems)
          .set({ sortOrder: k + 1 })
          .where(eq(priceItems.id, list[k].id));
    });
    refresh();
    return { ok: true };
  } catch (err) {
    logError("movePriceItem", err);
    return { ok: false, error: "Couldn't move. Try again." };
  }
}

// ---------- Account settings ----------

const accountSettingsSchema = z.object({
  expenseTypes: z
    .array(z.string().trim().min(1).max(60))
    .min(1, { error: "Keep at least one expense type." })
    .max(40)
    .transform((a) => [...new Set(a)]),
  receiptNote: z.string().trim().max(200).default(""),
});

export async function saveAccountSettings(data) {
  if (!(await getOwner())) return NOT_OWNER;
  const parsed = accountSettingsSchema.safeParse(data);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error), error: parsed.error.issues[0]?.message };
  try {
    await db
      .insert(settings)
      .values({ key: "accounts", value: parsed.data })
      .onConflictDoUpdate({ target: settings.key, set: { value: parsed.data, updatedAt: new Date() } });
    refresh();
    return { ok: true };
  } catch (err) {
    logError("saveAccountSettings", err);
    return { ok: false, error: "Couldn't save. Try again." };
  }
}
