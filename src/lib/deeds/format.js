// src/lib/deeds/format.js
// Bangla wording helpers for deeds (দলিল / চুক্তিপত্র). Works in the browser and in Node.
import { bnWords, parseAmount } from "@/lib/number-words";
import { toBanglaDigits } from "@/lib/utils";

export const bn = (v) => toBanglaDigits(String(v ?? ""));

/** 50000 → "৫০,০০০/-" ; "" when empty. */
export function money(v) {
    const a = parseAmount(v);
    if (!a) return "";
    const s = String(a.taka);
    const last3 = s.slice(-3);
    const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
    return `${bn(rest ? `${rest},${last3}` : last3)}/-`;
}

/** 50000 → "পঞ্চাশ হাজার" ; "" when empty. */
export function moneyWords(v) {
    const a = parseAmount(v);
    return a ? bnWords(a.taka) : "";
}

/** 50000 → "৫০,০০০/- (পঞ্চাশ হাজার) টাকা" */
export const takaText = (v) => (money(v) ? `${money(v)} (${moneyWords(v)}) টাকা` : "........ টাকা");

/** A whole number as Bangla digits, two places: 5 → "০৫". */
export const two = (n) => bn(String(Math.max(0, Math.floor(Number(n) || 0))).padStart(2, "0"));

/** 3 → "০৩ (তিন)" */
export const countText = (n) => `${two(n)} (${bnWords(Math.max(0, Math.floor(Number(n) || 0)))})`;

/** "2026-10-01" → "০১/১০/২০২৬" ; blank line when empty. */
export function bnDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    return m ? bn(`${m[3]}/${m[2]}/${m[1]}`) : "....../....../.........";
}

/** Add years to "YYYY-MM-DD", then go back one day (end of a term): 2026-05-01 + 5 → 2031-04-30. */
export function endOfTerm(iso, years) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    if (!m || !(years > 0)) return "";
    const d = new Date(Date.UTC(Number(m[1]) + Math.floor(years), Number(m[2]) - 1, Number(m[3])));
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
}

/** Today in Dhaka as "YYYY-MM-DD". */
export function todayIso() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(new Date());
}

/** Person fields, in the order they are written. */
export const personFields = [
    { key: "name", label: "নাম", required: true },
    { key: "father", label: "পিতা" },
    { key: "mother", label: "মাতা" },
    { key: "husband", label: "স্বামী" },
    { key: "house", label: "বাসা/হোল্ডিং" },
    { key: "village", label: "গ্রাম/রাস্তা" },
    { key: "post", label: "ডাকঘর" },
    { key: "upazila", label: "উপজেলা/থানা" },
    { key: "district", label: "জেলা" },
    { key: "nationality", label: "জাতীয়তা" },
    { key: "religion", label: "ধর্ম" },
    { key: "profession", label: "পেশা" },
    { key: "nid", label: "জাতীয় পরিচয় পত্র নং", digits: true },
    { key: "mobile", label: "মোবাইল নং", digits: true },
];

export const emptyPerson = () => ({ nationality: "বাংলাদেশী", religion: "ইসলাম" });

const clean = (v) => String(v ?? "").trim();

/**
 * One person written out as in the shop's deeds:
 * "মোঃ সেলিম মিয়া, পিতাঃ এছহাক মিয়া, ঠিকানাঃ ..., জেলাঃ কুমিল্লা। জাতীয়তাঃ বাংলাদেশী, ধর্মঃ ইসলাম, পেশাঃ ব্যবসা,
 *  জাতীয় পরিচয় পত্র নংঃ ৫৫৬...। মোবাইল নংঃ ০১৮...।"
 * @param {{ sep?: string, namePrefix?: boolean }} opts  sep = "ঃ" or ":"; namePrefix writes "নামঃ" first
 */
export function personText(p = {}, { sep = "ঃ", namePrefix = false } = {}) {
    const f = (k) => clean(p[k]);
    const d = (k) => bn(clean(p[k]));
    const s = (label, v) => `${label}${sep} ${v}`;
    const first = [];
    first.push(namePrefix ? s("নাম", f("name") || "............") : f("name") || "............");
    if (f("father")) first.push(s("পিতা", f("father")));
    if (f("mother")) first.push(s("মাতা", f("mother")));
    if (f("husband")) first.push(s("স্বামী", f("husband")));
    const addr = [];
    if (f("house")) addr.push(s("বাসা/হোল্ডিং", bn(f("house"))));
    if (f("village")) addr.push(s("গ্রাম/রাস্তা", bn(f("village"))));
    if (f("post")) addr.push(s("ডাকঘর", bn(f("post"))));
    if (f("upazila")) addr.push(s("উপজেলা/থানা", f("upazila")));
    if (f("district")) addr.push(s("জেলা", f("district")));
    let text = first.join(", ");
    if (addr.length) text += `, ঠিকানা${sep} ${addr.join(", ")}`;
    text += "।";
    const more = [];
    if (f("nationality")) more.push(s("জাতীয়তা", f("nationality")));
    if (f("religion")) more.push(s("ধর্ম", f("religion")));
    if (f("profession")) more.push(s("পেশা", f("profession")));
    if (f("nid")) more.push(s("জাতীয় পরিচয় পত্র নং", d("nid")));
    if (more.length) text += ` ${more.join(", ")}।`;
    if (f("mobile")) text += ` ${s("মোবাইল নং", d("mobile"))}।`;
    return text;
}

/** Short name for use inside sentences. */
export const nameOf = (p) => clean(p?.name) || "............";