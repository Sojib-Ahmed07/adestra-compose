// src/server/queries/settings.js
import "server-only";
import { cache } from "react";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { settings, users } from "@/db/schema";
import { logError } from "../errors";

export const defaultShop = { name: "My Shop", tagline: "Photo · Print · Computer", phone: "", address: "", email: "" };

/** Shop details (name on the sidebar, login page and printouts). Falls back to defaults. */
export const getShop = cache(async () => {
  try {
    const [row] = await db.select().from(settings).where(eq(settings.key, "shop"));
    return { ...defaultShop, ...(row?.value ?? {}) };
  } catch (err) {
    logError("getShop", err);
    return defaultShop;
  }
});

/** Everyone who can sign in (and removed people, so they can be restored). */
export async function getTeam() {
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      active: users.active,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(asc(users.createdAt));
}
