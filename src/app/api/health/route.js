// src/app/api/health/route.js
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { logError } from "@/server/errors";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, db: true });
  } catch (err) {
    logError("health", err);
    return Response.json({ ok: false, db: false }, { status: 500 });
  }
}
