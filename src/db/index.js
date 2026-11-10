// src/db/index.js
import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import { normaliseDatabaseUrl } from "./url";

const globalForDb = globalThis;

/** One pool per server process (dev hot-reload re-runs this file). */
const pool =
  globalForDb.__shopPool ??
  new Pool({
    connectionString: normaliseDatabaseUrl(process.env.DATABASE_URL),
    max: 5,
    idleTimeoutMillis: 20_000,
  });

if (process.env.NODE_ENV !== "production") globalForDb.__shopPool = pool;

export const db = drizzle(pool, { schema });
