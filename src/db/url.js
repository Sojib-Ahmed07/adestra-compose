// src/db/url.js
/**
 * Neon gives `sslmode=require&channel_binding=require`. node-postgres prints a warning for
 * `require`, so we ask for `verify-full` (same security, no warning) and drop channel_binding.
 * Local URLs (localhost) are left alone.
 * @param {string | undefined} raw
 */
export function normaliseDatabaseUrl(raw) {
  if (!raw) throw new Error("DATABASE_URL is missing. Copy .env.example to .env.local and fill it in.");
  try {
    const url = new URL(raw);
    url.searchParams.delete("channel_binding");
    if (url.searchParams.get("sslmode") === "require") url.searchParams.set("sslmode", "verify-full");
    return url.toString();
  } catch {
    return raw;
  }
}
