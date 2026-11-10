// src/server/actions/settings.js
"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, eq, ne, sql } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import { db } from "@/db";
import { accounts, sessions, settings, users } from "@/db/schema";
import { auth } from "../auth";
import { logError } from "../errors";
import { getCurrentUser, getOwner } from "../session";

const NOT_OWNER = { ok: false, error: "Only the shop owner can change this." };

function fieldErrorsOf(error) {
  const out = {};
  for (const issue of error.issues) out[issue.path[0]] ??= issue.message;
  return out;
}

// ---------- Shop details ----------

const shopSchema = z.object({
  name: z.string().trim().min(1, { error: "Enter the shop name." }).max(80),
  tagline: z.string().trim().max(120),
  phone: z.string().trim().max(60),
  email: z.union([z.literal(""), z.email({ error: "Enter a valid email or leave it empty." })]),
  address: z.string().trim().max(240),
});

export async function saveShop(data) {
  if (!(await getOwner())) return NOT_OWNER;
  const parsed = shopSchema.safeParse(data);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
  try {
    await db
      .insert(settings)
      .values({ key: "shop", value: parsed.data })
      .onConflictDoUpdate({ target: settings.key, set: { value: parsed.data, updatedAt: new Date() } });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    logError("saveShop", err);
    return { ok: false, error: "Couldn't save. Try again." };
  }
}

// ---------- Team ----------

const memberSchema = z.object({
  name: z.string().trim().min(1, { error: "Enter a name." }).max(80),
  email: z.email({ error: "Enter a valid email address." }),
  password: z.string().min(8, { error: "At least 8 characters." }).max(128),
  role: z.enum(["owner", "operator"]),
});

export async function addMember(data) {
  if (!(await getOwner())) return NOT_OWNER;
  const parsed = memberSchema.safeParse({
    ...data,
    email: String(data?.email || "")
      .trim()
      .toLowerCase(),
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
  const { name, email, password, role } = parsed.data;
  try {
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (existing)
      return { ok: false, fieldErrors: { email: "Someone already uses this email. Restore them from the list instead." } };
    const id = randomUUID();
    const hash = await hashPassword(password);
    await db.transaction(async (tx) => {
      await tx.insert(users).values({ id, name, email, emailVerified: true, role });
      await tx.insert(accounts).values({ id: randomUUID(), userId: id, accountId: id, providerId: "credential", password: hash });
    });
    revalidatePath("/settings");
    return { ok: true };
  } catch (err) {
    logError("addMember", err);
    return { ok: false, error: "Couldn't add this person. Try again." };
  }
}

/** Switch a login off (signs them out everywhere) or back on. The account is kept. */
export async function setMemberActive(userId, active) {
  const owner = await getOwner();
  if (!owner) return NOT_OWNER;
  if (userId === owner.id) return { ok: false, error: "You can't switch off your own login." };
  try {
    const [target] = await db.select().from(users).where(eq(users.id, userId));
    if (!target) return { ok: false, error: "Person not found." };
    if (!active && target.role === "owner") {
      const [{ count }] = await db
        .select({ count: sql`count(*)::int` })
        .from(users)
        .where(and(eq(users.role, "owner"), eq(users.active, true), ne(users.id, userId)));
      if (count < 1) return { ok: false, error: "There must always be at least one active owner." };
    }
    await db
      .update(users)
      .set({ active: Boolean(active), updatedAt: new Date() })
      .where(eq(users.id, userId));
    if (!active) await db.delete(sessions).where(eq(sessions.userId, userId));
    revalidatePath("/settings");
    return { ok: true };
  } catch (err) {
    logError("setMemberActive", err);
    return { ok: false, error: "Couldn't update. Try again." };
  }
}

export async function setMemberRole(userId, role) {
  const owner = await getOwner();
  if (!owner) return NOT_OWNER;
  if (!["owner", "operator"].includes(role)) return { ok: false, error: "Unknown role." };
  if (userId === owner.id && role !== "owner") return { ok: false, error: "You can't remove your own owner access." };
  try {
    await db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, userId));
    revalidatePath("/settings");
    return { ok: true };
  } catch (err) {
    logError("setMemberRole", err);
    return { ok: false, error: "Couldn't update. Try again." };
  }
}

/** Owner sets a new password for someone (e.g. an operator forgot theirs). Signs them out. */
export async function resetMemberPassword(userId, password) {
  const owner = await getOwner();
  if (!owner) return NOT_OWNER;
  if (typeof password !== "string" || password.length < 8)
    return { ok: false, fieldErrors: { password: "At least 8 characters." } };
  try {
    const hash = await hashPassword(password);
    const [acc] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "credential")));
    if (acc) await db.update(accounts).set({ password: hash, updatedAt: new Date() }).where(eq(accounts.id, acc.id));
    else
      await db.insert(accounts).values({ id: randomUUID(), userId, accountId: userId, providerId: "credential", password: hash });
    if (userId !== owner.id) await db.delete(sessions).where(eq(sessions.userId, userId));
    return { ok: true };
  } catch (err) {
    logError("resetMemberPassword", err);
    return { ok: false, error: "Couldn't change the password. Try again." };
  }
}

// ---------- My password ----------

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, { error: "Enter your current password." }),
    newPassword: z.string().min(8, { error: "At least 8 characters." }).max(128),
    confirm: z.string(),
  })
  .refine((d) => d.newPassword === d.confirm, { error: "The two new passwords don't match.", path: ["confirm"] });

export async function changeMyPassword(data) {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "Please sign in again." };
  const parsed = passwordSchema.safeParse(data);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
  try {
    const h = await headers();
    await auth.api.changePassword({
      body: { currentPassword: parsed.data.currentPassword, newPassword: parsed.data.newPassword },
      headers: h,
    });
    await auth.api.revokeOtherSessions({ headers: h });
    return { ok: true };
  } catch (err) {
    const status = /** @type {any} */ (err)?.statusCode;
    if (status === 400 || status === 401) return { ok: false, fieldErrors: { currentPassword: "Current password is wrong." } };
    logError("changeMyPassword", err);
    return { ok: false, error: "Couldn't change the password. Try again." };
  }
}
