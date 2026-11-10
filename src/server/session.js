// src/server/session.js
import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";

/**
 * The signed-in person, or null. Inactive (removed) people count as signed out.
 * @returns {Promise<{ id: string, name: string, email: string, role: "owner" | "operator" } | null>}
 */
export const getCurrentUser = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  const user = session?.user;
  if (!user || user.active === false) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role === "owner" ? "owner" : "operator" };
});

/** For layouts/pages: sends signed-out people to the login page. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** For owner-only pages. */
export async function requireOwner() {
  const user = await requireUser();
  if (user.role !== "owner") redirect("/");
  return user;
}

/** For Server Actions: returns the owner or null (the action then returns an error). */
export async function getOwner() {
  const user = await getCurrentUser();
  return user?.role === "owner" ? user : null;
}

/** Only allow redirects to paths on this site. */
export function safeNext(next) {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}
