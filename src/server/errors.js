// src/server/errors.js
import "server-only";

/**
 * Log a server error with a short tag. Prints a hint when the database tables are missing.
 * @param {string} tag
 * @param {unknown} err
 */
export function logError(tag, err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[${tag}]`, err);
  const cause = /** @type {any} */ (err)?.cause?.message ?? "";
  if (/relation .* does not exist|column .* does not exist/i.test(message + " " + cause)) {
    console.error(`[${tag}] The database is missing a table or column. Run: npm run db:push`);
  }
}
