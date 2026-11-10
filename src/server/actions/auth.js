// src/server/actions/auth.js
"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { auth } from "../auth";
import { logError } from "../errors";
import { safeNext } from "../session";

const signInSchema = z.object({
  email: z.email({ error: "Enter a valid email address." }),
  password: z.string().min(1, { error: "Enter your password." }),
  next: z.string().optional(),
});

export async function signIn(_prev, formData) {
  const parsed = signInSchema.safeParse({
    email: String(formData.get("email") || "")
      .trim()
      .toLowerCase(),
    password: String(formData.get("password") || ""),
    next: String(formData.get("next") || "/"),
  });
  if (!parsed.success) {
    const fieldErrors = {};
    for (const issue of parsed.error.issues) fieldErrors[issue.path[0]] ??= issue.message;
    return { ok: false, fieldErrors };
  }
  const { email, password, next } = parsed.data;

  try {
    const [person] = await db.select({ active: users.active }).from(users).where(eq(users.email, email));
    if (person && !person.active) return { ok: false, error: "This login has been switched off. Ask the shop owner." };

    await auth.api.signInEmail({ body: { email, password, rememberMe: true }, headers: await headers() });
  } catch (err) {
    const status = /** @type {any} */ (err)?.statusCode ?? /** @type {any} */ (err)?.status;
    if (status === 401 || status === "UNAUTHORIZED") return { ok: false, error: "Wrong email or password." };
    logError("signIn", err);
    return { ok: false, error: "Couldn't sign in right now. Check the internet connection and try again." };
  }
  redirect(safeNext(next));
}

export async function signOut() {
  try {
    await auth.api.signOut({ headers: await headers() });
  } catch (err) {
    logError("signOut", err);
  }
  redirect("/login");
}
