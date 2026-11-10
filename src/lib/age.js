// src/lib/age.js
// Date maths on "YYYY-MM-DD" strings, done in UTC so the computer's time zone never shifts a day.

export function parseISODate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || "")) return null;
  const [y, m, d] = s.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date;
}

export function toISO(date) {
  return date.toISOString().slice(0, 10);
}

/** Today's date on this computer, as "YYYY-MM-DD". */
export function todayISO() {
  const now = new Date();
  return toISO(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
}

const daysInMonth = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

/**
 * Exact age between two dates.
 * @returns {{ years: number, months: number, days: number, totalDays: number } | null}  null if `on` is before `birth`
 */
export function ageBetween(birth, on) {
  if (on < birth) return null;
  let years = on.getUTCFullYear() - birth.getUTCFullYear();
  let months = on.getUTCMonth() - birth.getUTCMonth();
  let days = on.getUTCDate() - birth.getUTCDate();
  if (days < 0) {
    months -= 1;
    // Borrow the length of the month before `on`.
    const pm = on.getUTCMonth() === 0 ? 11 : on.getUTCMonth() - 1;
    const py = on.getUTCMonth() === 0 ? on.getUTCFullYear() - 1 : on.getUTCFullYear();
    days += daysInMonth(py, pm);
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  const totalDays = Math.round((on - birth) / 86_400_000);
  return { years, months, days, totalDays };
}

/** Date the person turns `years` old (29 Feb birthdays use 28 Feb in non-leap years). */
export function birthdayAt(birth, years) {
  const y = birth.getUTCFullYear() + years;
  const m = birth.getUTCMonth();
  const d = Math.min(birth.getUTCDate(), daysInMonth(y, m));
  return new Date(Date.UTC(y, m, d));
}

/** Next birthday on or after `on`. */
export function nextBirthday(birth, on) {
  const age = ageBetween(birth, on);
  if (!age) return birthdayAt(birth, 0);
  const thisYear = birthdayAt(birth, age.years);
  return toISO(thisYear) === toISO(on) ? on : birthdayAt(birth, age.years + 1);
}

export function formatDateLong(date) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

export function formatDateBn(date) {
  return new Intl.DateTimeFormat("bn-BD", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}
