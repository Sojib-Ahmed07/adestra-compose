// src/server/auth.js
import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db";
import * as schema from "@/db/schema";

export const auth = betterAuth({
  baseURL: process.env.NEXT_PUBLIC_SITE_URL,
  secret: process.env.AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user: schema.users, session: schema.sessions, account: schema.accounts, verification: schema.verifications },
  }),
  emailAndPassword: {
    enabled: true,
    // Nobody can sign up from the website. The owner adds people in Settings › Team (or `npm run user:add`).
    disableSignUp: true,
    minPasswordLength: 8,
  },
  user: {
    additionalFields: {
      role: { type: "string", input: false, defaultValue: "operator" },
      active: { type: "boolean", input: false, defaultValue: true },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days — shop computers stay signed in
    updateAge: 60 * 60 * 24,
  },
  plugins: [nextCookies()],
});
