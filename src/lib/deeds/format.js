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

/** The address parts, in the order they are written (the NID card's order). */
export const addressFields = [
    { key: "house", label: "বাসা/হোল্ডিং", print: "বাসা/হোল্ডিং" },
    { key: "village", label: "গ্রাম/রাস্তা", print: "গ্রাম/রাস্তা" },
    { key: "post", label: "ডাকঘর", print: "ডাকঘর" },
    { key: "upazila", label: "থানা/উপজেলা", print: "থানা" },
    { key: "district", label: "জেলা", print: "জেলা" },
];
const ADDRESS_KEYS = addressFields.map((f) => f.key);

/** Person fields, in the order they are written. */
export const personFields = [
    { key: "name", label: "নাম", required: true },
    { key: "father", label: "পিতা" },
    { key: "mother", label: "মাতা" },
    { key: "husband", label: "স্বামী" },
    ...addressFields,
    { key: "nationality", label: "জাতীয়তা" },
    { key: "religion", label: "ধর্ম" },
    { key: "profession", label: "পেশা" },
    { key: "nid", label: "জাতীয় পরিচয় পত্র নং", digits: true },
    { key: "mobile", label: "মোবাইল নং", digits: true },
];

export const emptyPerson = () => ({ nationality: "বাংলাদেশী", religion: "ইসলাম" });

const clean = (v) => String(v ?? "").trim();

// labels as they are written on NID cards and in typed addresses
const PART_LABELS = [
    ["house", /^(?:বাসা\s*\/\s*হোল্ডিং|বাসা|হোল্ডিং(?:\s*নং)?|বাড়ি\s*নং|বাড়ী\s*নং|বাড়ি|বাড়ী)\s*(?:নং)?\s*[:ঃ\-]\s*/],
    ["village", /^(?:গ্রাম\s*\/\s*রাস্তা|রাস্তা\s*নং\s*\/\s*নাম|গ্রাম|রাস্তা|মহল্লা|সাং)\s*[:ঃ\-]\s*/],
    ["post", /^(?:ডাকঘর|পোস্ট\s*অফিস|পোঃ)\s*[:ঃ\-]?\s*/],
    ["upazila", /^(?:উপজেলা\s*\/\s*থানা|থানা\s*\/\s*উপজেলা|উপজেলা|থানা)\s*[:ঃ\-]?\s*/],
    ["district", /^(?:জেলা)\s*[:ঃ\-]?\s*/],
];

/**
 * A one-line address (as on the NID: "বাসা/হোল্ডিং: ১২, গ্রাম/রাস্তা: শিবপুর, ডাকঘর: শিবপুর - ৩৫৩০, দেবিদ্বার, কুমিল্লা")
 * → { house, village, post, upazila, district }. Labelled parts go to their box; the card's unlabelled parts after the
 * post office are the upazila (thana) and, last, the district. Nothing is thrown away: anything else stays in গ্রাম/রাস্তা.
 */
export function splitAddress(line) {
    const parts = String(line || "")
        .replace(/^\s*ঠিকানা\s*[:ঃ]?\s*/, "")
        .split(/\s*[,،]\s*/)
        .map((x) => x.trim())
        .filter(Boolean);
    const out = {};
    const rest = []; // { at, text } unlabelled
    let postAt = -1;
    parts.forEach((part, i) => {
        const hit = PART_LABELS.find(([, re]) => re.test(part));
        if (hit) {
            const v = part.replace(hit[1], "").trim();
            if (hit[0] === "post") postAt = i;
            if (v && v !== "-") out[hit[0]] = out[hit[0]] ? `${out[hit[0]]}, ${v}` : v;
        } else if (/[০-৯0-9]{4}\s*$/.test(part) && postAt < 0 && !out.post) {
            postAt = i;
            out.post = part;
        } else rest.push({ at: i, text: part });
    });
    const after = rest.filter((r) => postAt >= 0 && r.at > postAt).map((r) => r.text);
    const before = rest.filter((r) => postAt < 0 || r.at < postAt).map((r) => r.text);
    if (postAt < 0 && before.length >= 2 && !out.district) out.district = before.pop();
    if (after.length && !out.district) out.district = after.pop();
    if (after.length) out.upazila = [out.upazila, ...after].filter(Boolean).join(", ");
    if (before.length) out.village = [out.village, ...before].filter(Boolean).join(", ");
    return out;
}

/** The 5 address parts → one line ("বাসা/হোল্ডিং: ১২, গ্রাম/রাস্তা: …, ডাকঘর: …, থানা: …, জেলা: ঢাকা"). */
export const joinAddress = (p = {}, sep = ":") =>
    addressFields
        .filter((f) => clean(p[f.key]))
        .map((f) => `${f.print}${sep} ${bn(clean(p[f.key]))}`)
        .join(", ");

/**
 * People saved between 20 and 23 Nov 2026 have the whole address in one `address` box: it is split back into the parts
 * (nothing is lost — anything that can't be placed goes to গ্রাম/রাস্তা).
 */
export function normalizePerson(p) {
    if (!p || typeof p !== "object" || !clean(p.address)) return p;
    const out = { ...p };
    if (!ADDRESS_KEYS.some((k) => clean(out[k]))) Object.assign(out, splitAddress(out.address));
    delete out.address;
    return out;
}

/**
 * One person written out as in the shop's deeds:
 * "মোঃ সেলিম মিয়া, পিতাঃ এছহাক মিয়া, গ্রাম/রাস্তাঃ …, ডাকঘরঃ …, থানাঃ …, জেলাঃ কুমিল্লা। জাতীয়তাঃ বাংলাদেশী,
 *  ধর্মঃ ইসলাম, পেশাঃ ব্যবসা, জাতীয় পরিচয় পত্র নংঃ ৫৫৬...। মোবাইল নংঃ ০১৮...।"
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
    // address parts (a person from a 20–23 Nov draft may still have the one-line `address`)
    const addr = (joinAddress(p, sep) || bn(f("address"))).replace(/[\s,।]+$/, "");
    let text = first.join(", ");
    if (addr) text += `, ${addr}`;
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

/** Short address for a witness line: "শিবপুর, দেবিদ্বার, কুমিল্লা". */
export const shortAddress = (p = {}) =>
    ["village", "post", "upazila", "district"]
        .map((k) => clean(p[k]).replace(/\s*-\s*[০-৯0-9]{4}$/, ""))
        .filter((v, i, a) => v && a.indexOf(v) === i)
        .join(", ") || clean(p.address);

/** Short name for use inside sentences. */
export const nameOf = (p) => clean(p?.name) || "............";