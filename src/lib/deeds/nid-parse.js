// src/lib/deeds/nid-parse.js
// The text read from an NID card (nid.js) → the person's details. Pure functions (also run in Node for tests).
// The address is handed to nid-address.js (checked against the real districts / upazilas / post codes).
//
// Front, both cards:   নাম / Name / পিতা / মাতা (or স্বামী) / Date of Birth / NID No (ID NO on the old card).
//   The smart card puts each label on its own small line above the value; the old card has "নাম: …" on one line.
//   Labels are often misread, so values are also found by their place: the Bangla line before the English name is the
//   name, the next two Bangla lines are father and mother.
// Back:  ঠিকানা: বাসা/হোল্ডিং: …, গ্রাম/রাস্তা: …, ডাকঘর: … - 1234, উপজেলা, জেলা — the lines are handed to
//   nid-address.js as they are (it finds misread labels and checks every part against the real places).
//   The smart card's back also has 3 machine lines (MRZ): I<BGD + NID number, date of birth, English name — the NID number there has a check digit, so it is trusted when it checks out.

import { addressLine, mergeAddress } from "./nid-address";

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
const toAscii = (s) => String(s).replace(/[০-৯]/g, (c) => String(BN_DIGITS.indexOf(c)));
const BANGLA = /[ঀ-৿]/;
const bnShare = (s) => {
    const t = s.replace(/[\s.,:ঃ\-/]/g, "");
    if (!t) return 0;
    return [...t].filter((c) => BANGLA.test(c)).length / [...t].length;
};

/** Keep the Bangla words of a value (drops misread Latin bits, stray marks); "মো:" → "মোঃ". */
// a word-final hasant with a zero-width joiner ("আবদুল্লাহ্‌") is a reading slip, never printed on the card
const dropJoiners = (v) =>
    String(v || "")
        .replace(/্?[\u200C\u200D]/g, "")
        .replace(/্(?=\s|,|$)/g, "");
function cleanBn(v) {
    let s = dropJoiners(v)
        .replace(/^.*(?:নাম|পিতা|মাতা|স্বামী)\s*[:ঃ]\s*/, "")
        .replace(/[|¦_“”"'`~*=<>«»{}\[\]()@#$%^&!?;]/g, " ")
        .replace(/(^|\s)মো\s*[:ঃ.]/g, "$1মোঃ ")
        .replace(/(^|\s)মোসা\s*[:ঃ.]/g, "$1মোসাঃ ")
        .replace(/(^|\s)মোছা\s*[:ঃ.]/g, "$1মোছাঃ ");
    s = s
        .split(/\s+/)
        .filter((w) => w && BANGLA.test(w) && !/[A-Za-z0-9০-৯]/.test(w) && !/^[\u09BC-\u09D7\u09E2\u09E3্ঃ:]/.test(w))
        .join(" ");
    return fixName(
        s
            .replace(/\s*ঃ\s*/g, "ঃ ")
            .replace(/\s+/g, " ")
            .replace(/^[\s.,ঃ:-]+|[\s.,:-]+$/g, "")
            .trim(),
    );
}

// ——— spelling checks: a word must be a possible Bangla word; districts and common name words are matched to the right
// spelling when the reading is one or two letters off ———

const CONS = /[ক-হৎড়ঢ়য়]/;
const SIGN = /[ঁ-ঃ়া-ৄেৈো-্ৗৢৣ]/;
/** Can this be a Bangla word? (no sign at the start, ্ only between consonants, no two vowel signs in a row) */
export function wellFormed(w) {
    const c = [...w.replace(/[‌‍]/g, "")];
    if (!c.length || SIGN.test(c[0])) return false;
    for (let i = 0; i < c.length; i++) {
        if (c[i] === "্" && !(CONS.test(c[i - 1] || "") && CONS.test(c[i + 1] || "")) && i !== c.length - 1) return false;
        if (/[া-ৌ]/.test(c[i]) && /[া-ৌ্]/.test(c[i + 1] || "")) return false;
    }
    return true;
}

function distance(a, b) {
    // য় ড় ঢ় count as one letter (they can be written as letter + dot)
    const one = (t) =>
        t
            .normalize("NFD")
            .replace(/\u09AF\u09BC/g, "\u09DF")
            .replace(/\u09A1\u09BC/g, "\u09DC")
            .replace(/\u09A2\u09BC/g, "\u09DD");
    const x = [...one(a)];
    const y = [...one(b)];
    const d = Array.from({ length: x.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= y.length; j++) d[0][j] = j;
    for (let i = 1; i <= x.length; i++)
        for (let j = 1; j <= y.length; j++)
            d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    return d[x.length][y.length];
}

/** Common parts of Bangladeshi names; a word one (or, at the end of a name, two) letters off one of these is set right. */
const NAME_WORDS = [
    "মোঃ",
    "মোসাঃ",
    "মোছাঃ",
    "মুহাম্মদ",
    "মোহাম্মদ",
    "মোহাম্মাদ",
    "আব্দুল",
    "আবদুল",
    "আব্দুর",
    "আবু",
    "বেগম",
    "খাতুন",
    "খান",
    "খন্দকার",
    "পাটোয়ারী",
    "হাওলাদার",
    "মজুমদার",
    "বেপারী",
    "আক্তার",
    "আখতার",
    "আক্তারুজ্জামান",
    "মিয়া",
    "ইসলাম",
    "উদ্দিন",
    "উদ্দীন",
    "হোসেন",
    "হোসাইন",
    "আলী",
    "রহমান",
    "আহমেদ",
    "আহম্মেদ",
    "আহমদ",
    "সরকার",
    "শেখ",
    "মোল্লা",
    "মন্ডল",
    "মণ্ডল",
    "ব্যাপারী",
    "ভূঁইয়া",
    "ভূইয়া",
    "চৌধুরী",
    "তালুকদার",
    "প্রামানিক",
    "হক",
    "কবির",
    "আলম",
    "নাহার",
    "জাহান",
    "নেছা",
    "নেসা",
    "বিবি",
    "কুমার",
    "রানী",
    "চন্দ্র",
    "দাস",
    "পাল",
    "সাহা",
    "দেবী",
    "হাসান",
    "হাসান",
    "মাহমুদ",
    "করিম",
    "রহিম",
    "কাশেম",
    "কাসেম",
    "জামান",
    "হালদার",
    "পারভীন",
    "সুলতানা",
    "ফাতেমা",
    "আয়েশা",
    "নূর",
    "নুর",
    "আমিন",
    "মমিন",
    "মোমিন",
    "ফারুক",
    "ওমর",
    "রশিদ",
    "মজিদ",
    "হামিদ",
    "জলিল",
    "খলিল",
    "বাশার",
    "গনি",
    "সাত্তার",
];
const NAME_SET = new Set(NAME_WORDS);
// the usual last words of a name — a misread last word is matched to these more freely
const SUFFIXES = new Set(["মিয়া", "বেগম", "খাতুন", "আক্তার", "উদ্দিন", "ইসলাম", "হোসেন", "রহমান", "আহমেদ", "সরকার", "মোল্লা"]);
function fixNameWord(w, last) {
    if (NAME_SET.has(w) || [...w].length < 3) return w;
    let best = w;
    let bestD = Infinity;
    for (const n of NAME_WORDS) {
        const d = distance(w, n);
        const limit = [...n].length >= 4 ? 1 : 0;
        // only a swapped letter (same length) — an added / missing letter is too often a different real name (আবুল ≠ আবদুল)
        const same = [...w.normalize("NFD")].length === [...n.normalize("NFD")].length;
        const ok = (d <= limit && same) || (last && SUFFIXES.has(n) && d <= 2 && [...n][0] === [...w][0]);
        if (ok && d < bestD) {
            bestD = d;
            best = n;
        }
    }
    return best;
}
/** Words of a name: impossible words dropped, common parts spelled right. */
export function fixName(v) {
    const words = String(v || "")
        .split(" ")
        .filter((w) => w && ([...w].length >= 2 || w === "ও") && wellFormed(w.replace(/ঃ$/, "")));
    const out = words.map((w, i) => fixNameWord(w, i === words.length - 1 && i > 0));
    // a stray bit after the usual last word ("… মিয়া সত") is not part of the name
    while (
        out.length > 2 &&
        SUFFIXES.has(out[out.length - 2]) &&
        !NAME_SET.has(out[out.length - 1]) &&
        [...out[out.length - 1]].length <= 3
    )
        out.pop();
    return out.join(" ");
}

const LABEL = {
    name: /^(?:নাম|লাম|নান|নাষ|লাষ)\s*[:ঃ;.]?\s*/,
    father: /^(?:পিতা|প্তা|পিত|পিভা|পিতাঃ|শিতা|সিতা)\s*[:ঃ;.]?\s*/,
    mother: /^(?:মাতা|মাভা|মাত|খাতা|মাতাঃ)\s*[:ঃ;.]?\s*/,
    husband: /^(?:স্বামী|স্বামি|শ্বামী)\s*[:ঃ;.]?\s*/,
};
const isLabelWord = (v) => /^(?:নাম|পিতা|মাতা|স্বামী|নম|প্তা|মাত)$/.test(v);
const HEADER = /গণপ্রজাতন্ত্রী|বাংলাদেশ|সরকার|জাতীয়|পরিচয়|কার্ডটি|সম্পত্তি|পোস্ট|অফিস|অনুরোধ|প্রদান|কর্তৃপক্ষ|রক্তের|জন্মস্থান/;
const EN_SKIP = /GOVERNMENT|REPUBLIC|BANGLADESH|NATIONAL|CARD|PEOPLE|DATE|BIRTH|NID|ID ?NO|BLOOD|GROUP|PLACE|ISSUE|BGD/i;

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
function monthOf(word) {
    const w = String(word || "")
        .toUpperCase()
        .replace(/[^A-Z]/g, "")
        .slice(0, 3);
    if (!w) return -1;
    let best = -1;
    let bestScore = 0;
    MONTHS.forEach((m, i) => {
        const score = [...m].filter((c, k) => w[k] === c).length;
        if (score > bestScore) {
            bestScore = score;
            best = i;
        }
    });
    return bestScore >= 2 ? best : -1;
}
const iso = (y, m, d) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** ICAO 9303 check digit. */
function checkDigit(s) {
    const val = (c) => (c === "<" ? 0 : /\d/.test(c) ? Number(c) : c.charCodeAt(0) - 55);
    return [...s].reduce((t, c, i) => t + val(c) * [7, 3, 1][i % 3], 0) % 10;
}

/** The smart card's machine lines → { nid, dob, sex } (only what checks out). */
export function parseMrz(text) {
    const out = {};
    const flat = String(text || "")
        .toUpperCase()
        .replace(/[«€(]/g, "<")
        .replace(/ /g, "");
    // line 1: I<BGD + 9 digits + "<" + the rest of the number + check digit
    const m1 = /I.?<?BGD([0-9OIS]{9})[<KLC]?([0-9OIS]{0,8})/.exec(flat);
    if (m1) {
        const fix = (s) => s.replace(/O/g, "0").replace(/I/g, "1").replace(/S/g, "5");
        const head = fix(m1[1]);
        const tail = fix(m1[2]);
        for (let k = tail.length - 1; k >= 0; k--) {
            const nid = head + tail.slice(0, k);
            if (checkDigit(nid) === Number(tail[k]) && [10, 13, 17].includes(nid.length)) {
                out.nid = nid;
                break;
            }
        }
    }
    // line 2: YYMMDD + check, sex, expiry + check, BGD
    const m2 = /(\d{6})(\d)([MF<])(\d{6})(\d)BGD/.exec(flat.replace(/O/g, "0"));
    if (m2 && checkDigit(m2[1]) === Number(m2[2])) {
        const yy = Number(m2[1].slice(0, 2));
        const now = new Date().getFullYear() % 100;
        const y = (yy > now ? 1900 : 2000) + yy;
        out.dob = iso(y, Number(m2[1].slice(2, 4)) - 1, Number(m2[1].slice(4, 6)));
        if (m2[3] !== "<") out.sex = m2[3];
    }
    return out;
}

/**
 * Text of one card side (or a photocopy page with both) → the fields found.
 * @param {string} text  Bangla + English reading
 * @param {string} [mrz] English reading of the machine lines (smart card back)
 */
export function parseNid(text, mrz = "") {
    const lines = String(text || "")
        .split(/\n/)
        .map((l) => l.replace(/\s+/g, " ").trim())
        .filter(Boolean);
    const out = {};

    // ——— front ———
    const value = (i, re) => {
        const rest = lines[i].replace(re, "").trim();
        const okVal = (v) => v.length > 2 && !isLabelWord(v) && v.split(" ").length <= 6;
        // smart card: the label line may carry specks of the card pattern read as letters ("পিতা পারা Bn") — when the line
        // below is a fuller Bangla line, that is the value
        const below = lines[i + 1] || "";
        const belowOk =
            bnShare(below) > 0.6 &&
            !HEADER.test(below) &&
            !Object.values(LABEL).some((r) => r.test(below)) &&
            okVal(cleanBn(below)) &&
            cleanBn(below).split(" ").length >= 2;
        const restClean = cleanBn(rest);
        const junky = /[A-Za-z0-9$'%]/.test(rest) || restClean.split(" ").length < 2;
        if (belowOk && junky) return cleanBn(below);
        if (bnShare(rest) > 0.5 && okVal(restClean)) return restClean;
        // smart card: the label is on its own line, the value below
        for (let j = i + 1; j < Math.min(lines.length, i + 3); j++) {
            if (Object.values(LABEL).some((r) => r.test(lines[j]))) break;
            if (bnShare(lines[j]) > 0.5 && !HEADER.test(lines[j]) && okVal(cleanBn(lines[j]))) return cleanBn(lines[j]);
        }
        return "";
    };
    const at = {};
    lines.forEach((l, i) => {
        const plain = l.replace(/^[^ঀ-৿A-Za-z]+/, "");
        for (const [k, re] of Object.entries(LABEL)) {
            if (at[k] === undefined && re.test(plain)) {
                const v = value(i, re);
                if (v) {
                    at[k] = i;
                    out[k] = v;
                }
            }
        }
    });
    // English name (helps to find the Bangla lines around it, and is shown to the staff)
    // the front's words (a page with both sides has the back's too — still a front)
    const isFront = /Birth|পিতা|মাতা|Name|গণপ্রজাতন্ত্রী|National ID|জাতীয় পরিচয়/i.test(text);
    let enAt = -1;
    let enScore = 0;
    lines.forEach((l, i) => {
        const labelled = /Name\s*[:.]?/i.test(l);
        const m = /^(?:Name\s*[:.]?\s*)?([A-Z][A-Z.\s]{4,})$/.exec(l.replace(/[^A-Za-z.:\s]/g, "").trim());
        if (!m || EN_SKIP.test(m[1])) return;
        const words = m[1]
            .replace(/^NAME\s*/i, "")
            .split(/[\s.]+/)
            .filter(Boolean);
        const good = words.filter((w) => w.length >= 2 && /[AEIOUY]/.test(w)).length;
        if (good < 2 || good < words.length - 1) return;
        const short = words.filter((w) => w.replace(/\./g, "").length < 2 && w !== "MD").length;
        const score = good + words.join("").length / 10 - short + (labelled ? 5 : 0) + (isFront ? 1 : -10);
        if (score > enScore && score > 1) {
            enScore = score;
            enAt = i;
            out.nameEn = words.join(" ").replace(/^MD /, "MD. ");
        }
    });
    if (enAt >= 0) {
        // Bangla lines around the English name: [{ text, label }] (label = which label the line starts with, if any)
        const bnLines = (from, dir, n) => {
            const got = [];
            for (let j = from; j >= 0 && j < lines.length && got.length < n; j += dir) {
                const l = lines[j];
                if (HEADER.test(l) || /Birth|NID|ID ?NO/i.test(l)) {
                    if (dir < 0) break;
                    continue;
                }
                const plain = l.replace(/^[^\u0980-\u09FF]+/, "");
                const label = Object.keys(LABEL).find((k) => LABEL[k].test(plain));
                const rest = label ? cleanBn(plain.replace(LABEL[label], "")) : cleanBn(l);
                if (label && rest.length < 2) continue; // a label on its own line
                if (bnShare(l) > 0.55 && rest.length > 2 && !isLabelWord(rest) && rest.split(" ").length <= 6)
                    got.push({ text: rest, label });
            }
            return got;
        };
        const before = bnLines(enAt - 1, -1, 1)[0];
        if (!out.name && before && (!before.label || before.label === "name")) out.name = before.text;
        const after = bnLines(enAt + 1, 1, 2);
        const [a1, a2] = after;
        if (!out.father && !out.husband && a1 && (!a1.label || a1.label === "father")) out.father = a1.text;
        const m2 = a1?.label === "mother" ? a1 : a2;
        if (!out.mother && m2 && (!m2.label || m2.label === "mother") && m2.text !== out.father) out.mother = m2.text;
    }
    // date of birth
    const dobLine = lines.find((l) => /Birth|Bir|Date/i.test(l)) || "";
    const dm = /(\d{1,2})\s*([A-Za-z]{3,})\s*([12]\s*\d\s*\d\s*\d)/.exec(dobLine);
    if (dm && monthOf(dm[2]) >= 0) out.dob = iso(Number(dm[3].replace(/\s/g, "")), monthOf(dm[2]), Number(dm[1]));
    // NID number: after "NID No" / "ID NO", else the longest run of 10 / 13 / 17 digits that is not a date or MRZ line
    const digitsOf = (l) => toAscii(l).replace(/[^0-9]/g, "");
    const nidLine = lines.find((l) => /N\s*[I1l]?\s*D\s*N[o0O]|ID\s*N[o0O]|NID|IDNO/i.test(l) && digitsOf(l).length >= 10);
    const okLen = (d) => [10, 13, 17].includes(d.length);
    if (nidLine) {
        const d = digitsOf(nidLine.replace(/^.*?(?:N[o0O]\.?|NO\.?|:)/i, ""));
        if (okLen(d)) {
            out.nid = d;
            out.nidScore = 2;
        } else if (d.length > 10) out.nidGuess = d;
    }
    if (!out.nid && isFront) {
        // no readable label: a run of digits — best on the line after the date of birth (where the number is printed)
        const dobIdx = lines.findIndex((l) => /Birth|Bir|Date/i.test(l));
        let best = 0;
        lines.forEach((l, i) => {
            if (/<|BGD|\//.test(l)) return;
            const near = dobIdx >= 0 && i > dobIdx && i <= dobIdx + 2;
            for (const r of toAscii(l).match(/\d[\d ]{8,24}\d/g) || []) {
                const d = r.replace(/ /g, "");
                // a few stray digits read in front of the number: keep the last 10 (smart card numbers are 10 digits)
                const nid = okLen(d) ? d : d.length > 10 && d.length < 15 ? d.slice(-10) : "";
                if (!nid || nid[0] === "0" || new Set(nid).size < 4) continue; // barcode / date noise
                const sc = !nid ? 0 : (near ? 1.5 : 0.5) + (okLen(d) ? 0.2 : 0);
                if (sc > best) {
                    best = sc;
                    out.nid = nid;
                    out.nidScore = sc;
                }
            }
        });
    }

    // ——— back ———
    const startAt = lines.findIndex((l) => /ঠিকান|ঠিকা না|ঠিকনা/.test(l));
    const firstAddr =
        startAt >= 0 ? startAt : lines.findIndex((l) => /গ্রাম\s*\/|বাসা\s*\/|বাড়ি\s*নং|ডাক\s*ঘর|রাস্তা\s*:|হো[ল্]*ডিং/.test(l));
    if (firstAddr >= 0) {
        const parts = [];
        for (let j = firstAddr; j < lines.length && parts.length < 4; j++) {
            const l = lines[j];
            if (j > firstAddr && /Blood|Group|Place|Birth|Issue|রক্তের|গ্রুপ|ক্রুপ|জন্মস্থান|প্রদান|<|BGD/i.test(l)) break;
            if (j > firstAddr && bnShare(l) < 0.4) break;
            parts.push(l);
        }
        // the raw text: nid-address.js splits and checks it (several readings are voted together in mergeNid)
        out.addressRaw = parts.join(" , ");
    }
    const blood = /Blood\s*Group\s*[:.]?\s*(A|B|AB|O)\s*([+-]|\(?[+-]?ve\)?)/i.exec(text);
    if (blood) out.blood = `${blood[1].toUpperCase()}${blood[2].includes("-") ? "-" : "+"}`;

    // ——— machine lines ———
    const mz = parseMrz(`${mrz}\n${text}`);
    if (mz.nid) {
        out.nid = mz.nid;
        out.nidChecked = true;
        out.nidScore = 3;
    }
    if (mz.dob) {
        out.dob = mz.dob;
        out.dobChecked = true; // the machine lines' check digit agrees — wins over the printed date as read
    }

    for (const k of Object.keys(out)) if (out[k] === "" || out[k] === undefined) delete out[k];
    return out;
}

const NAME_KEYS = ["name", "father", "mother", "husband"];

/** How believable a read value is (more Bangla, sensible length). */
function quality(k, v) {
    if (!v) return -1;
    if (NAME_KEYS.includes(k)) {
        const words = v.split(" ").filter((w) => w.length > 1).length;
        return bnShare(v) * 10 + Math.min(words, 4) + (v.length > 40 ? -5 : 0);
    }
    return 1;
}

/** A value that looks like a real name (Bangla only, 1–6 words of 2+ letters). */
function plausible(k, v) {
    if (!v) return false;
    if (!NAME_KEYS.includes(k)) return quality(k, v) > 0;
    const words = v.split(" ");
    return bnShare(v) > 0.9 && words.length <= 6 && words.filter((w) => [...w].length >= 2).length >= Math.max(1, words.length - 1);
}

/**
 * Several readings (front, back, other settings) → one set of fields. For each field the most believable value wins;
 * an NID number confirmed by the machine lines always wins.
 */
export function mergeNid(list, extraAddress = []) {
    const out = {};
    // the address: every reading of it, voted part by part and checked against the real places (nid-address.js);
    // `extraAddress` = readings of the address block alone (the smart card's back), they come first
    const raws = [...extraAddress, ...list.map((r) => r.addressRaw).filter(Boolean)];
    Object.assign(out, mergeAddress(raws));
    const line = addressLine(out);
    if (line) out.addressLine = line;
    let nidScore = 0;
    for (const r of list) {
        for (const [k, v] of Object.entries(r)) {
            if (k === "nidChecked" || k === "nidScore" || k === "dobChecked" || k === "addressRaw") continue;
            if (k === "dob" && r.dobChecked) {
                out.dob = v;
                out.dobSure = true;
                continue;
            }
            if (k === "dob" && out.dobSure) continue;
            if (k === "nid") {
                const sc = (r.nidScore || 1) * 100 + v.length;
                if (sc > nidScore) {
                    nidScore = sc;
                    out.nid = v;
                    out.nidChecked = !!r.nidChecked;
                }
                continue;
            }
            // readings come best-first: keep the first believable value; a later one only replaces junk
            if (!plausible(k, out[k]) && quality(k, v) > quality(k, out[k])) out[k] = v;
        }
    }
    // a name read without its last word ("… নাগর") is completed by a reading that has it ("… নাগর মিয়া")
    for (const k of ["name", "father", "mother", "husband"]) {
        if (!out[k]) continue;
        for (const r of list) {
            const v = r[k];
            if (!v || !v.startsWith(`${out[k]} `) || !plausible(k, v)) continue;
            const extra = v.slice(out[k].length + 1).split(" ");
            if (extra.length <= 2 && extra.every((w) => NAME_SET.has(w)) && v.length > out[k].length) out[k] = v;
        }
    }
    delete out.dobSure;
    if (!out.nidChecked) delete out.nidChecked;
    if (out.nid) delete out.nidGuess;
    return out;
}

/** The deed person keys the reader can fill. */
export const nidPersonKeys = ["name", "father", "mother", "husband", "house", "village", "post", "upazila", "district", "nid"];