// src/db/add-user.js
// Add a person or reset their password from the terminal.
//   npm run user:add -- --email you@shop.com --password "min 8 chars" --name "Your Name" --owner
// Without --owner the person is an operator. Running it again for the same email changes the password
// (and makes them an owner if --owner is given). It also re-activates a removed person.
import { loadEnvConfig } from "@next/env";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";
import { normaliseDatabaseUrl } from "./url.js";

loadEnvConfig(process.cwd());

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = arg("email")?.trim().toLowerCase();
  const password = arg("password");
  const name = arg("name")?.trim();
  const owner = process.argv.includes("--owner");

  if (!email || !email.includes("@")) throw new Error("Give an email: --email you@shop.com");
  if (!password || password.length < 8) throw new Error('Give a password of at least 8 characters: --password "..."');

  const pool = new Pool({ connectionString: normaliseDatabaseUrl(process.env.DATABASE_URL) });
  const db = drizzle(pool, { schema });
  try {
    const hash = await hashPassword(password);
    const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, email));

    if (existing) {
      await db
        .update(schema.users)
        .set({ ...(name ? { name } : {}), ...(owner ? { role: "owner" } : {}), active: true, updatedAt: new Date() })
        .where(eq(schema.users.id, existing.id));
      const [acc] = await db
        .select()
        .from(schema.accounts)
        .where(and(eq(schema.accounts.userId, existing.id), eq(schema.accounts.providerId, "credential")));
      if (acc) {
        await db.update(schema.accounts).set({ password: hash, updatedAt: new Date() }).where(eq(schema.accounts.id, acc.id));
      } else {
        await db.insert(schema.accounts).values({
          id: randomUUID(),
          userId: existing.id,
          accountId: existing.id,
          providerId: "credential",
          password: hash,
        });
      }
      console.log(`Updated ${email}${owner ? " (owner)" : ""}. Password changed.`);
    } else {
      const id = randomUUID();
      await db.insert(schema.users).values({
        id,
        name: name || email.split("@")[0],
        email,
        emailVerified: true,
        role: owner ? "owner" : "operator",
      });
      await db
        .insert(schema.accounts)
        .values({ id: randomUUID(), userId: id, accountId: id, providerId: "credential", password: hash });
      console.log(`Created ${email} as ${owner ? "owner" : "operator"}. You can sign in now.`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  if (/does not exist/.test(String(err.message))) console.error("Run `npm run db:push` first.");
  process.exit(1);
});
