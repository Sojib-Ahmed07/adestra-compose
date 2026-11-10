// src/lib/accounts.js
// Shared (client + server) helpers for shop accounts: money, Dhaka dates, labels.

export const payMethods = {
  cash: "Cash",
  bkash: "bKash",
  nagad: "Nagad",
  rocket: "Rocket",
  bank: "Bank",
  card: "Card",
};

export const defaultExpenseTypes = [
  "Paper",
  "Ink & toner",
  "Lamination & binding",
  "Photo paper",
  "Rent",
  "Electricity",
  "Internet",
  "Salary",
  "Repair & parts",
  "Tea & snacks",
  "Transport",
  "Other",
];

/** Round to paisa. */
export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const bnDigits = "০১২৩৪৫৬৭৮৯";

/** "১,২৫০.৫০" / "1,250.5" / "৳ 1250" → 1250.5. Returns NaN when it isn't a number (negatives too). */
export function parseMoney(input) {
  const s = String(input ?? "")
    .replace(/[০-৯]/g, (d) => String(bnDigits.indexOf(d)))
    .replace(/[,\s৳]|tk|taka/gi, "");
  if (s === "") return 0;
  if (!/^\d*\.?\d{0,2}$/.test(s) || s === ".") return NaN;
  return round2(Number(s));
}

/** 125000 → "৳1,25,000", 99.5 → "৳99.50" (Bangladeshi grouping). */
export function taka(n, { sign = false } = {}) {
  const v = round2(n);
  const abs = Math.abs(v);
  const str = abs.toLocaleString("en-IN", { minimumFractionDigits: abs % 1 ? 2 : 0, maximumFractionDigits: 2 });
  const prefix = v < 0 ? "−" : sign && v > 0 ? "+" : "";
  return `${prefix}৳${str}`;
}

// ---------- Dates (always Asia/Dhaka, as "YYYY-MM-DD") ----------

const dhakaFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" });

/** Today in Dhaka. */
export const todayDhaka = () => dhakaFmt.format(new Date());

/** The Dhaka calendar date of any moment. */
export const dhakaDateOf = (d) => dhakaFmt.format(new Date(d));

export function isISODate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || "")) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "2026-11-10" → "10 Nov 2026" */
export function formatDay(iso, opts = {}) {
  if (!isISODate(iso)) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    weekday: opts.weekday ? "short" : undefined,
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00Z`));
}

/** Time of a timestamp in Dhaka: "4:35 pm" */
export function formatTime(ts) {
  return new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Dhaka" }).format(
    new Date(ts),
  );
}

export const rangePresets = {
  today: "Today",
  yesterday: "Yesterday",
  week: "Last 7 days",
  month: "This month",
  lastMonth: "Last month",
  year: "This year",
  custom: "Pick dates",
};

/** Date range for a preset (inclusive), in Dhaka. */
export function rangeFor(preset, today = todayDhaka()) {
  const [y, m] = today.split("-").map(Number);
  const first = (yy, mm) => `${yy}-${String(mm).padStart(2, "0")}-01`;
  switch (preset) {
    case "yesterday": {
      const d = addDays(today, -1);
      return { from: d, to: d };
    }
    case "week":
      return { from: addDays(today, -6), to: today };
    case "month":
      return { from: first(y, m), to: today };
    case "lastMonth": {
      const py = m === 1 ? y - 1 : y;
      const pm = m === 1 ? 12 : m - 1;
      return { from: first(py, pm), to: addDays(first(y, m), -1) };
    }
    case "year":
      return { from: `${y}-01-01`, to: today };
    default:
      return { from: today, to: today };
  }
}

/** Amount still owed on an entry. */
export const entryDue = (e) => round2(Number(e.total) - Number(e.discount || 0) - Number(e.paid));

/** Read ?range=&from=&to= from the URL → { range, from, to, label }. Falls back to `fallback` preset. */
export function resolveRange(sp, fallback = "today") {
  const range = Object.hasOwn(rangePresets, sp?.range) ? sp.range : fallback;
  if (range === "custom" && isISODate(sp?.from) && isISODate(sp?.to)) {
    const [from, to] = sp.from <= sp.to ? [sp.from, sp.to] : [sp.to, sp.from];
    return { range, from, to, label: from === to ? formatDay(from) : `${formatDay(from)} – ${formatDay(to)}` };
  }
  const r = rangeFor(range === "custom" ? "today" : range);
  const shown = range === "custom" ? "today" : range;
  return { range: shown, ...r, label: r.from === r.to ? formatDay(r.from) : `${formatDay(r.from)} – ${formatDay(r.to)}` };
}
