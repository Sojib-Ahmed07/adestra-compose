// src/lib/number-words.js
// Amounts in words, Bangladesh style (lakh / crore), in Bangla and English.

// Bangla numbers 0–99 are irregular, so they are listed in full.
const bn = [
  "শূন্য",
  "এক",
  "দুই",
  "তিন",
  "চার",
  "পাঁচ",
  "ছয়",
  "সাত",
  "আট",
  "নয়",
  "দশ",
  "এগারো",
  "বারো",
  "তেরো",
  "চৌদ্দ",
  "পনেরো",
  "ষোলো",
  "সতেরো",
  "আঠারো",
  "উনিশ",
  "বিশ",
  "একুশ",
  "বাইশ",
  "তেইশ",
  "চব্বিশ",
  "পঁচিশ",
  "ছাব্বিশ",
  "সাতাশ",
  "আটাশ",
  "ঊনত্রিশ",
  "ত্রিশ",
  "একত্রিশ",
  "বত্রিশ",
  "তেত্রিশ",
  "চৌত্রিশ",
  "পঁয়ত্রিশ",
  "ছত্রিশ",
  "সাঁইত্রিশ",
  "আটত্রিশ",
  "ঊনচল্লিশ",
  "চল্লিশ",
  "একচল্লিশ",
  "বিয়াল্লিশ",
  "তেতাল্লিশ",
  "চুয়াল্লিশ",
  "পঁয়তাল্লিশ",
  "ছেচল্লিশ",
  "সাতচল্লিশ",
  "আটচল্লিশ",
  "ঊনপঞ্চাশ",
  "পঞ্চাশ",
  "একান্ন",
  "বাহান্ন",
  "তিপ্পান্ন",
  "চুয়ান্ন",
  "পঞ্চান্ন",
  "ছাপ্পান্ন",
  "সাতান্ন",
  "আটান্ন",
  "ঊনষাট",
  "ষাট",
  "একষট্টি",
  "বাষট্টি",
  "তেষট্টি",
  "চৌষট্টি",
  "পঁয়ষট্টি",
  "ছেষট্টি",
  "সাতষট্টি",
  "আটষট্টি",
  "ঊনসত্তর",
  "সত্তর",
  "একাত্তর",
  "বাহাত্তর",
  "তিয়াত্তর",
  "চুয়াত্তর",
  "পঁচাত্তর",
  "ছিয়াত্তর",
  "সাতাত্তর",
  "আটাত্তর",
  "ঊনআশি",
  "আশি",
  "একাশি",
  "বিরাশি",
  "তিরাশি",
  "চুরাশি",
  "পঁচাশি",
  "ছিয়াশি",
  "সাতাশি",
  "আটাশি",
  "ঊননব্বই",
  "নব্বই",
  "একানব্বই",
  "বিরানব্বই",
  "তিরানব্বই",
  "চুরানব্বই",
  "পঁচানব্বই",
  "ছিয়ানব্বই",
  "সাতানব্বই",
  "আটানব্বই",
  "নিরানব্বই",
];

const enOnes = [
  "Zero",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const enTens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function en99(n) {
  if (n < 20) return enOnes[n];
  return enTens[Math.floor(n / 10)] + (n % 10 ? `-${enOnes[n % 10]}` : "");
}

/**
 * Split a whole number into crore / lakh / thousand / hundred / rest.
 * Above 99 crore the crore part itself is written in words again (e.g. "এক হাজার কোটি").
 */
function parts(n) {
  return {
    crore: Math.floor(n / 1e7),
    lakh: Math.floor((n % 1e7) / 1e5),
    thousand: Math.floor((n % 1e5) / 1e3),
    hundred: Math.floor((n % 1e3) / 100),
    rest: n % 100,
  };
}

/** Whole number → Bangla words. 0 → "শূন্য" */
export function bnWords(n) {
  n = Math.floor(Math.abs(n));
  if (n === 0) return bn[0];
  const p = parts(n);
  const out = [];
  if (p.crore) out.push(`${bnWords(p.crore)} কোটি`);
  if (p.lakh) out.push(`${bn[p.lakh]} লক্ষ`);
  if (p.thousand) out.push(`${bn[p.thousand]} হাজার`);
  if (p.hundred) out.push(`${bn[p.hundred]}শত`);
  if (p.rest) out.push(bn[p.rest]);
  return out.join(" ");
}

/** Whole number → English words (lakh/crore). 0 → "Zero" */
export function enWords(n) {
  n = Math.floor(Math.abs(n));
  if (n === 0) return enOnes[0];
  const p = parts(n);
  const out = [];
  if (p.crore) out.push(`${enWords(p.crore)} Crore`);
  if (p.lakh) out.push(`${en99(p.lakh)} Lakh`);
  if (p.thousand) out.push(`${en99(p.thousand)} Thousand`);
  if (p.hundred) out.push(`${enOnes[p.hundred]} Hundred`);
  if (p.rest) out.push((out.length ? "and " : "") + en99(p.rest));
  return out.join(" ");
}

/** Parse "1,25,000.50", "১২৫০০০.৫০" or a number → { taka, poisa } or null. */
export function parseAmount(input) {
  const s = String(input ?? "")
    .replace(/[০-৯]/g, (d) => "০১২৩৪৫৬৭৮৯".indexOf(d))
    .replace(/[,\s৳]/g, "")
    .replace(/(tk|taka|টাকা)$/i, "");
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  const taka = Number(whole);
  if (!Number.isSafeInteger(taka) || taka > 999_999_999_999) return null;
  return { taka, poisa: Number((frac + "00").slice(0, 2)) };
}

/** { taka, poisa } → "এক লক্ষ পঁচিশ হাজার টাকা পঞ্চাশ পয়সা মাত্র" */
export function bnAmount({ taka, poisa }) {
  let s = `${bnWords(taka)} টাকা`;
  if (poisa) s += ` ${bnWords(poisa)} পয়সা`;
  return `${s} মাত্র`;
}

/** { taka, poisa } → "One Lakh Twenty-Five Thousand Taka and Fifty Paisa Only" */
export function enAmount({ taka, poisa }) {
  let s = `${enWords(taka)} Taka`;
  if (poisa) s += ` and ${enWords(poisa)} Paisa`;
  return `${s} Only`;
}

/** 1250000.5 → "12,50,000.50" (Bangladeshi grouping) */
export function groupBD(taka, poisa) {
  const s = String(taka);
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  const whole = rest ? `${rest},${last3}` : last3;
  return poisa ? `${whole}.${String(poisa).padStart(2, "0")}` : whole;
}
