// src/lib/deeds/nid-address.js
// The NID card's address, read by the OCR (often with wrong letters) → the 5 deed boxes
// { house, village, post, upazila, district }, checked against the real list of Bangladesh's districts, upazilas /
// thanas, unions and post codes (bd-places.js). Pure functions (also run in Node for tests).
//
// How the card writes it:  ঠিকানা: বাসা/হোল্ডিং: ১২, গ্রাম/রাস্তা: শিবপুর, ডাকঘর: কাশিনগর - ৩৫৩০, চৌদ্দগ্রাম, কুমিল্লা
//   (old card: … ডাকঘর: …, উপজেলা: …, জেলা: …; city: … ডাকঘর: মোহাম্মদপুর - ১২০৭, মোহাম্মদপুর, ঢাকা দক্ষিণ সিটি কর্পোরেশন, ঢাকা)
// The checks, all of them "never guess wrong":
//   district   a word 1–2 letters off a real district is set right; else the post code's district; else empty.
//   upazila    matched to the upazilas / thanas OF THAT DISTRICT (a small list, so a 2–3 letter slip is still safe);
//              when unreadable, the post code's thana is used — only if the code belongs to the same district.
//   post code  4 digits that exist in that district. A code from another district = misread: a code in this district
//              one digit away is used when there is exactly one, else the code is left out.
//   post office matched to the unions / upazilas of the district (post offices are mostly named after them);
//              no close match → the words as read (only possible Bangla words).
//   village / house  as read, cleaned (no gazetteer for villages).
// mergeAddress() votes across several readings of the same card (different image versions), part by part.
import { DISTRICTS, POST, UPAZILAS } from "./bd-places";

const BN = "০১২৩৪৫৬৭৮৯";
const toBn = (s) => String(s).replace(/[0-9]/g, (c) => BN[c]);
const toAscii = (s) => String(s).replace(/[০-৯]/g, (c) => String(BN.indexOf(c)));
const BANGLA = /[ঀ-৿]/;

/** Same letters written two ways (য় = য + ়, ী/ি, ূ/ু and ণ/ন are often swapped on cards and by the reader) */
function key(t) {
    return String(t || "")
        .normalize("NFC")
        .replace(/য়/g, "য়")
        .replace(/ড়/g, "ড়")
        .replace(/ঢ়/g, "ঢ়")
        .replace(/[‌‍\s.]/g, "");
}
/** Looser form for matching only: long/short vowel signs and ন/ণ count as the same letter. */
const loose = (t) => key(t).replace(/ী/g, "ি").replace(/ূ/g, "ু").replace(/ণ/g, "ন").replace(/ঈ/g, "ই").replace(/ঊ/g, "উ");

function distance(a, b) {
    const x = [...a];
    const y = [...b];
    if (Math.abs(x.length - y.length) > 4) return 99;
    let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
    for (let i = 1; i <= x.length; i++) {
        const cur = [i];
        for (let j = 1; j <= y.length; j++)
            cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
        prev = cur;
    }
    return prev[y.length];
}

/** How many letters may be wrong for a name of this length (`roomy` = the list is small, e.g. one district's upazilas). */
const tolerance = (len, roomy) => (len <= 2 ? 0 : len <= 4 ? (roomy ? 1 : 0) : len <= 6 ? 1 : len <= 9 ? 2 : roomy ? 3 : 2);

/**
 * The closest name in `list` to `text`, or null. A tie between two different names = not sure = null.
 * @returns {{ name: string, i: number, d: number } | null}
 */
function closest(text, list, roomy) {
    const t = loose(text);
    if (!t) return null;
    const len = [...t].length;
    let best = null;
    let second = 99;
    list.forEach((name, i) => {
        const n = loose(name);
        const d = t === n ? 0 : distance(t, n);
        if (best === null || d < best.d) {
            if (best) second = Math.min(second, best.d);
            best = { name, i, d };
        } else if (d < second && name !== best.name) second = d;
    });
    if (!best) return null;
    const limit = tolerance(Math.max(len, [...loose(best.name)].length), roomy);
    if (best.d > limit) return null;
    if (best.d > 0 && second === best.d) return null;
    return best;
}

// ——— the places list, unpacked once ———
let places = null;
function index() {
    if (places) return places;
    const byDistrict = DISTRICTS.map(() => []);
    const ups = UPAZILAS.map(([d, name, unions], i) => {
        const u = { i, d, name, unions: unions ? unions.split("|") : [] };
        byDistrict[d].push(u);
        return u;
    });
    const post = new Map();
    for (const rec of POST.split(" ")) {
        const [code, d, u] = rec.split(".");
        post.set(code, { code, d: Number(d), u: u === "" ? -1 : Number(u) });
    }
    // other spellings seen on cards
    const alias = {
        চট্রগ্রাম: "চট্টগ্রাম",
        চিটাগাং: "চট্টগ্রাম",
        নারায়নগঞ্জ: "নারায়ণগঞ্জ",
        মুন্সীগঞ্জ: "মুন্সিগঞ্জ",
        নেত্রকোনা: "নেত্রকোণা",
        যশোহর: "যশোর",
        "চাঁপাই নবাবগঞ্জ": "চাঁপাইনবাবগঞ্জ",
        ঝালকাঠী: "ঝালকাঠি",
        রাঙামাটি: "রাঙ্গামাটি",
        কুষ্টিযা: "কুষ্টিয়া",
        বগুরা: "বগুড়া",
        ময়মনসিং: "ময়মনসিংহ",
        "মৌলভী বাজার": "মৌলভীবাজার",
        ব্রাহ্মনবাড়িয়া: "ব্রাহ্মণবাড়িয়া",
        "কক্স বাজার": "কক্সবাজার",
    };
    places = { byDistrict, ups, post, alias };
    return places;
}

/** A district name (or a bit of text ending with one) → { d, name, d0 (letters off) } | null */
export function findDistrict(text) {
    const { alias } = index();
    const words = String(text || "")
        .replace(/[^ঀ-৥\s]/g, " ")
        .split(/\s+/)
        .filter(Boolean);
    if (!words.length) return null;
    // the district is the last word or two
    const tries = [words.slice(-2).join(" "), words[words.length - 1], words.slice(-2).join("")].filter(Boolean);
    let best = null;
    for (const t of tries) {
        const a = alias[t] || alias[key(t)];
        if (a) return { d: DISTRICTS.indexOf(a), name: a, dist: 0 };
        const m = closest(t, DISTRICTS, true);
        if (m && (!best || m.d < best.dist)) best = { d: m.i, name: m.name, dist: m.d };
    }
    return best;
}

/** An upazila / thana inside district `d` (or anywhere when d < 0, then stricter). */
function findUpazila(text, d) {
    const { byDistrict, ups } = index();
    const clean = String(text || "")
        .replace(/[^ঀ-৥\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    if (!clean) return null;
    const list = d >= 0 ? byDistrict[d] : ups;
    const names = list.map((u) => u.name);
    // "ভোলা সদর" may be read as "ভোলা" or "সদর" alone; try the text as it is, then without "সদর" / "মডেল"
    const tries = [clean, clean.replace(/\s*(?:সদর|মডেল)$/, "")];
    for (const t of tries) {
        const m = closest(t, names, d >= 0);
        if (m) return { u: list[m.i], dist: m.d };
    }
    if (d >= 0) {
        // the district's main upazila: "<district> সদর"
        const sadar = list.find((u) => u.name === `${DISTRICTS[d]} সদর`);
        if (sadar && /সদর/.test(clean)) return { u: sadar, dist: 1 };
    }
    return null;
}

/** A post office name: matched to a union / upazila of the district (post offices are mostly named after them). */
function fixPostOffice(text, d, u) {
    const { byDistrict } = index();
    const clean = String(text || "")
        .replace(/[^ঀ-৥\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    if (!clean) return "";
    if (d < 0) return clean;
    const near = u ? [u.name, ...u.unions] : [];
    const far = byDistrict[d].flatMap((x) => [x.name, ...x.unions]);
    // the upazila's own unions: a slip of 1–2 letters; the rest of the district: only 1 letter, and only longer names
    const m = (near.length && closest(clean, near, true)) || closest(clean, far, false);
    if (m && (near.includes(m.name) || (m.d <= 1 && [...clean].length >= 5))) return m.name;
    return clean;
}

// ——— reading the text ———

const CITY = /সিটি\s*কর্পোরেশন|সিটি\s*কর্পো|পৌরসভা|ক্যান্টনমেন্ট বোর্ড/;

/** Possible Bangla word? (no vowel sign first, ্ only between consonants, no two vowel signs in a row, not a jumble) */
function wordOk(w) {
    const c = [...w.replace(/[‌‍]/g, "")];
    if (!c.length) return false;
    if (/[়-ৗৢৣ্ঃ]/.test(c[0])) return false;
    const CONS = /[ক-হৎড়ঢ়য়]/;
    for (let i = 0; i < c.length; i++) {
        if (c[i] === "্" && !(CONS.test(c[i - 1] || "") && CONS.test(c[i + 1] || ""))) return false;
        if (/[া-ৌ]/.test(c[i]) && /[া-ৌ্]/.test(c[i + 1] || "")) return false;
    }
    const cons = (w.match(/[ক-হড়-য়]/g) || []).length;
    const vow = (w.match(/[অ-ঔা-ৌৗ]/g) || []).length;
    if ((cons >= 4 && cons / (vow + 1) > 3.5) || (w.match(/্/g) || []).length >= 3 || /([ক-হ])\1\1/.test(w)) return false;
    return true;
}

/** A word that is a bit of one of the card's labels ("বাসা", "হোল্ডিং", "গ্রাম/রাস্তা") left over by a misreading. */
const LABEL_BITS = ["বাসা", "হোল্ডিং", "বাসা/হোল্ডিং", "গ্রাম/রাস্তা", "ডাকঘর", "ঠিকানা", "উপজেলা"].map(loose);
const labelBit = (w) => {
    const t = loose(w.replace(/[:.,]/g, ""));
    return t.length >= 3 && LABEL_BITS.some((l) => t === l || (l.length >= 5 && distance(t, l) <= 1));
};

/** Keep the believable words of one part (digits only where `digits` is allowed). */
function tidy(v, digits) {
    return String(v || "")
        .split(/\s+/)
        .filter((w) => {
            if (!w || labelBit(w)) return false;
            if (w === ",") return true;
            if (w === "-" || w === "/") return true;
            const letters = w.replace(/[.,:;]/g, "");
            if (!letters) return false;
            if (/^[০-৯/\-]+$/.test(letters)) return digits && letters.replace(/[^০-৯0-9]/g, "").length <= 5;
            if (/[০-৯]/.test(letters)) return digits && /^[০-৯]+[/\-]?[ঀ-৥]{0,2}$/.test(letters); // "১২/ক"
            if (/^[ঀ-৿]{1,2}\.$/.test(w)) return true; // সি. এ.
            return [...letters].length >= 2 && wordOk(letters);
        })
        .join(" ")
        .replace(/^[\s,.:\-/]+|[\s,.:\-/]+$/g, "")
        .trim();
}

/** The raw reading → one line, Latin bits and junk marks gone, Bangla digits, "," and ":" spaced out. */
/**
 * A line that is the barcode / machine lines read as text: long runs of digits ("৯৮০৪১ ১৬৪৯৬৯৬১১১১ …"), "<<<", or
 * more digits than letters. The address block's cut-out often catches the smart card's barcode above it.
 */
function junkLine(line) {
    const l = String(line);
    if (/<{2,}|BGD/.test(l)) return true;
    const digits = (l.match(/[০-৯0-9]/g) || []).length;
    const letters = (l.match(/[\u0980-\u09E5A-Za-z]/g) || []).length;
    if (/[০-৯0-9]{7,}/.test(l.replace(/\s+/g, "")) && digits > letters) return true;
    return digits >= 6 && digits > letters * 1.5;
}

function prepareText(raw) {
    let s = ` ${String(raw || "")
        .split("\n")
        .filter((l) => !junkLine(l))
        .join("\n")} `
        .replace(/্?[‌‍]/g, "")
        .replace(/[“”"'`‘’|॥_~*=<>«»{}[\]()@#$%^&!?]/g, " ")
        .replace(/\n/g, " ") // a card line often breaks inside a name ("চর⏎আলগী"); the card prints its own commas
        .replace(/[;ঃ]/g, ":")
        .replace(/[।]/g, ",")
        .replace(/\.{2,}/g, " ");
    s = toBn(s).replace(/[A-Za-z]+/g, " "); // Latin letters never belong in a Bangla address ("ঢাকাKC" → "ঢাকা")
    // stop at the next part of the card (blood group, place of birth, issue date, the signature line)
    s = s.split(/রক্তের|গ্রুপ|জন্মস্থান|মুদ্রণ|প্রদানের|প্রদানকারী|কর্তৃপক্ষ|ইস্যু/)[0];
    return s
        .replace(/\s*\/\s*/g, "/")
        .replace(/([ঀ-৥])[-–—]([০-৯])/g, "$1 - $2")
        .replace(/[-–—]/g, " - ")
        .replace(/:/g, " : ")
        .replace(/,/g, " , ")
        .replace(/\s+/g, " ")
        .trim();
}

// the card's labels: [part, label, letters that may be misread]. Labels with "/" are long and distinctive, so they are
// also found when glued to the value ("গ্রাম/রাস্তামধ্যপাড়া").
const LABEL_WORDS = [
    ["start", "ঠিকানা", 2],
    ["house", "বাসা/হোল্ডিং", 3],
    ["house", "বাড়িনং", 1],
    ["house", "হোল্ডিং", 2],
    ["house", "বাসা", 0],
    ["house", "বাড়ি", 0],
    ["house", "বাড়ী", 0],
    ["village", "গ্রাম/রাস্তা", 3],
    ["village", "রাস্তানং/নাম", 3],
    ["village", "গ্রাম", 1],
    ["village", "রাস্তা", 1],
    ["village", "মহল্লা", 1],
    ["post", "ডাকঘর", 1],
    ["upazila", "উপজেলা", 1],
    ["upazila", "থানা", 0],
    ["district", "জেলা", 0],
].map(([kind, label, tol]) => ({ kind, label, l: loose(label), tol }));

/** A word that is (or starts with) one of the card's labels → { kind, rest } */
function labelOf(word) {
    const k = key(word);
    const t = loose(k);
    if (!t || /^[০-৯]/.test(t)) return null;
    for (const L of LABEL_WORDS)
        if (t === L.l || (Math.abs(t.length - L.l.length) <= L.tol && distance(t, L.l) <= L.tol)) return { kind: L.kind, rest: "" };
    for (const L of LABEL_WORDS) {
        if (!L.label.includes("/") && L.kind !== "start") continue;
        for (let cut = L.l.length - 1; cut <= L.l.length + 1; cut++) {
            if (t.length - cut < 2) continue;
            if (distance(t.slice(0, cut), L.l) <= Math.max(1, L.tol - 1)) return { kind: L.kind, rest: k.slice(cut) };
        }
    }
    return null;
}

/**
 * One reading of the address → parts `{ house, village, postName, code, upazila, city, district, score }`,
 * not yet checked against the places list. Labels are found even when misread; commas are often lost, so labels and the
 * post code split the text too.
 */
export function splitReading(raw) {
    const s = prepareText(raw);
    if (!s || (s.match(/[ঀ-৥]/g) || []).length < 4) return null;
    let segs = [];
    let cur = { kind: null, words: [] };
    const close = () => {
        if (cur.kind || cur.words.length) segs.push(cur);
        cur = { kind: null, words: [] };
    };
    let score = 0;
    for (const tok of s.split(" ")) {
        if (tok === ",") {
            close();
            continue;
        }
        if (tok === ":") {
            // only labels are followed by ":" on the card — words before it that were not recognised are a misread label
            // "বাড়ি নং:", "রাস্তা নং/নাম:" — the rest of a label that was already found
            if (cur.kind && cur.words.length && cur.words.every((w) => /^(?:নং|নম্বর|নাম|নং\/নাম|\/নাম|\/)$/.test(w))) {
                cur.words = [];
                continue;
            }
            if (cur.words.length && cur.words.length <= 3) {
                // words right before ":" are a misread label ("বাসা হো পয:" = বাসা/হোল্ডিং: … গ্রাম/রাস্তা:) — drop them; when they
                // followed a known label, the card's next part starts here (its place in the line decides which)
                if (cur.kind) {
                    cur.words = [];
                    close();
                }
                cur = { kind: "unknown", words: [] };
            }
            continue;
        }
        const lab = labelOf(tok);
        if (lab) {
            score += 2;
            // one short word just before a label, with no comma between, is a broken-off bit of that label ("গম রাস্তা:")
            if (!cur.kind && cur.words.length === 1 && [...cur.words[0]].length <= 4 && !/[০-৯]/.test(cur.words[0])) cur.words = [];
            if (lab.kind === "start") {
                segs = []; // everything before "ঠিকানা" is not the address
                cur = { kind: null, words: [] };
                if (lab.rest) cur.words.push(lab.rest);
                continue;
            }
            close();
            cur = { kind: lab.kind, words: lab.rest ? [lab.rest] : [] };
            continue;
        }
        cur.words.push(tok);
    }
    close();
    // the card's other printed lines that can end up in an address reading (the smart card's back says the card is the
    // government's property and asks the finder to post it)
    segs = segs.filter(
        (x) =>
            !/কার্ড|সম্পত্তি|সরকার|অনুরোধ|ফেরত|নিকটস্থ|পোস্ট|বাক্সে|জমা|প্রজাতন্ত্র|বাংলাদেশ|জাতীয়|পরিচয়/.test(x.words.join(" ")),
    );
    // the post office: the ডাকঘর part, or the first part with a 4-digit code
    let postAt = segs.findIndex((x) => x.kind === "post");
    if (postAt < 0)
        postAt = segs.findIndex((x) => x.words.some((w) => /^[০-৯]{4}$/.test(w)) && x.words.some((w) => /[ঀ-৥]/.test(w)));
    const out = { score };
    if (postAt >= 0) {
        const words = segs[postAt].words.filter((w) => w !== "-");
        const at = words.findIndex((w) => /^[১-৯][০-৯]{3}$/.test(w)); // post codes never start with ০
        if (at >= 0) {
            out.code = words[at];
            out.postName = words.slice(0, at).join(" ");
            score += 4;
            const tail = words.slice(at + 1).filter((w) => /[ঀ-৥]/.test(w));
            if (tail.length) segs.splice(postAt + 1, 0, { kind: null, words: tail });
        } else out.postName = words.join(" ");
    } else {
        // no post office part: the last lone 4-digit number (not "০১৪৮ ০০" — a holding number) is the code
        const lone = [...s.matchAll(/(?:^|\s|-)([১-৯][০-৯]{3})(?=\s*(?:,|$|\s[^\s০-৯]))/g)].pop();
        if (lone) out.code = lone[1];
    }
    const text = (x) =>
        x.words
            .join(" ")
            .replace(/^[\s\-/]+|[\s\-/]+$/g, "")
            .trim();
    const before = [];
    const after = [];
    segs.forEach((x, i) => {
        if (i === postAt) return;
        const v = text(x);
        if (x.kind && x.kind !== "unknown") {
            if (v && !out[x.kind]) out[x.kind] = v;
            return;
        }
        if (!v) return;
        (postAt >= 0 && i > postAt ? after : before).push({ v, unknown: x.kind === "unknown" });
    });
    // before the post office: a misread label with a number (or "-") is বাসা/হোল্ডিং, the rest গ্রাম/রাস্তা
    const bv = [];
    for (const b of before) {
        if (!out.house && b.unknown && /^[০-৯\s/-]*[ঀ-৥]{0,2}$/.test(b.v) && !bv.length) out.house = b.v;
        else bv.push(b.v);
    }
    // after it: upazila / thana, a city corporation, and the district last
    const av = after.map((x) => x.v);
    const city = av.filter((p) => CITY.test(p));
    const rest = av.filter((p) => !CITY.test(p));
    if (city.length) out.city = city[city.length - 1];
    if (!out.district && rest.length) out.district = rest.pop();
    if (!out.upazila && rest.length) out.upazila = rest.join(" ");
    if (postAt < 0 && bv.length >= 2 && !out.district) {
        out.district = bv.pop();
        if (!out.upazila && bv.length >= 2) out.upazila = bv.pop();
    }
    if (bv.length) out.village = [out.village, ...bv].filter(Boolean).join(", ");
    out.score = score;
    return out;
}

/**
 * One reading → checked parts. Returns null when nothing usable was read.
 * @returns {{ house?, village?, post?, upazila?, district?, code?, sure: object, score: number } | null}
 */
export function readAddress(raw) {
    const r = splitReading(raw);
    if (!r) return null;
    // no label, no post code, no district: not an address (e.g. the front of a card read by mistake)
    if (r.score < 4 && !r.code && !findDistrict(r.district)) return null;
    const { post } = index();
    const sure = {};
    // district: the text, else the post code's district
    let dist = findDistrict(r.district);
    // "দেবিদ্বার কুমিল্লা" read as one part (the comma was lost): the words in front are the upazila
    if (dist && !r.upazila) {
        const words = String(r.district).trim().split(/\s+/);
        const dw = dist.name.split(" ").length;
        if (words.length > dw) r.upazila = words.slice(0, -dw).join(" ");
    }
    // the district's word may have been joined to the upazila ("দেবিদ্বার কুমিল্লা")
    if (!dist && r.upazila) {
        const m = findDistrict(r.upazila);
        if (m) {
            dist = m;
            r.upazila = r.upazila.replace(/\s*\S+$/, "");
        }
    }
    const pc = r.code ? post.get(toAscii(r.code)) : null;
    let code = r.code ? toAscii(r.code) : "";
    let d = dist ? dist.d : -1;
    if (d < 0 && pc) d = pc.d;
    // the code belongs to another district → a digit was misread: not used (other readings of the card vote). The code list
    // is not complete (e.g. ২২০৭ মোমেনশাহী সেনানিবাস is missing), so a code that is not in it is kept as read.
    if (pc && d >= 0 && pc.d !== d) code = "";
    const pcOk = code ? post.get(code) : null;
    if (pcOk && dist && pcOk.d === dist.d) sure.code = sure.district = true;
    // upazila / thana: inside the district; when unreadable, the post code's thana
    let up = findUpazila(r.upazila, d);
    if (!up && d < 0 && r.upazila) {
        up = findUpazila(r.upazila, -1);
        if (up && up.dist === 0) d = up.u.d;
        else up = null;
    }
    // the post code's thana is only a fallback (used in mergeAddress when no reading has a readable upazila)
    const upCode = pcOk && pcOk.u >= 0 && pcOk.d === d ? index().ups[pcOk.u].name : "";
    if (up && pcOk && pcOk.u === up.u.i) sure.upazila = true;
    const out = { sure, score: r.score };
    if (upCode) out.upCode = upCode;
    if (r.house) {
        const h = tidy(r.house, true).replace(/\s*-\s*/g, "-");
        if (h && h !== "-") out.house = h;
    }
    if (r.village) {
        const v = tidy(r.village.replace(/,/g, " , "), true)
            .replace(/\s+,/g, ",")
            .replace(/^,\s*|,\s*$/g, "");
        if (v) out.village = v;
    }
    if (d >= 0) {
        out.district = DISTRICTS[d];
        out.score += dist ? 8 - dist.dist * 2 : 4;
    }
    if (up) {
        // a city corporation / পৌরসভা part is not the thana — left out
        out.upazila = up.u.name;
        out.score += 6 - up.dist;
    } else if (r.upazila) {
        // not in the list (a new upazila, a city area): the words as read, only when they look right
        const t = tidy(r.upazila, false);
        if (t && d >= 0) out.upazila = t;
    }
    const name = fixPostOffice(tidy(r.postName, false), d, up?.u);
    if (name || code) out.post = name && code ? `${name} - ${toBn(code)}` : name || toBn(code);
    if (code) out.code = code;
    if (sure.code) out.score += 6;
    if (sure.upazila) out.score += 4;
    return Object.keys(out).length > 2 ? out : null;
}

const PARTS = ["house", "village", "post", "upazila", "district"];

/**
 * Several readings of the same card's address (best first) → one address, voted part by part. District first, then the
 * upazila and the post office only from readings that agree with that district.
 * @param {string[]} raws
 * @returns {{ house?, village?, post?, upazila?, district? }}
 */
export function mergeAddress(raws) {
    const reads = raws.map(readAddress).filter(Boolean);
    if (!reads.length) return {};
    const vote = (list, k, weight) => {
        const tally = new Map();
        list.forEach((r, i) => {
            const v = r[k];
            if (!v) return;
            const w = weight(r, i);
            tally.set(v, (tally.get(v) || 0) + w);
        });
        let best = "";
        let bestW = 0;
        for (const [v, w] of tally) if (w > bestW || (w === bestW && v.length > best.length)) [best, bestW] = [v, w];
        return best;
    };
    // earlier readings are a little better; a reading with a confirmed post code counts more
    const w = (r, i) => 1 + r.score / 20 + (r.sure.district ? 1 : 0) + Math.max(0, 0.3 - i * 0.02);
    const out = {};
    out.district = vote(reads, "district", w);
    // readings of the same district, and readings where the district was not read (often the clearest other parts)
    const same = reads.filter((r) => !out.district || !r.district || r.district === out.district);
    out.upazila = vote(same, "upazila", (r, i) => w(r, i) + (r.sure.upazila ? 1 : 0));
    // free text (village, house, an unknown post office): the reading closest to all the others — each reading gets
    // different letters wrong, so the "middle" one has the fewest mistakes
    const middle = (vals) => {
        const list = vals.filter(Boolean);
        if (list.length <= 2) return list[0] || "";
        let best = list[0];
        let bestD = Infinity;
        for (const a of list) {
            const t = list.reduce((sum, b) => sum + distance(key(a), key(b)), 0);
            if (t < bestD) [best, bestD] = [a, t];
        }
        return best;
    };
    // village: no list to check against, so each reading is judged by its words — a word counts when another reading of
    // the same card has it too (a letter or two may differ), a word nobody else read counts against. The reading with the
    // best score wins (ties: more agreed words). "চর ৯৮০৪১…" or "দ্র ২২ শ্গাত্মুর" lose to "লঙ্গারচর চর আলগী".
    // (several readings and none agree → left empty: a jumble is worse than an empty box; one reading → used as read)
    const villages = same.map((r) => r.village).filter(Boolean);
    out.village = wordByWord(villages) || agreed(villages) || (villages.length <= 2 ? middle(villages) : "");
    out.house = middle(same.map((r) => r.house));
    // post office: a code checked against the district wins; the name is voted when it is a known place, else the middle
    const codes = same.filter((r) => r.code);
    // the code: most readings win (one vote each; a code that matches the district in the list counts a little more)
    const code = vote(codes, "code", (r) => 1 + (r.sure.code ? 0.3 : 0));
    // no readable upazila in any reading: the thana of the chosen post code
    if (!out.upazila && code) out.upazila = same.find((r) => r.code === code && r.upCode)?.upCode || "";
    const names = same.map((r) => (r.post || "").replace(/\s*-?\s*[০-৯]{4}$/, "")).filter(Boolean);
    const known = names.filter((n, i) => names.indexOf(n) !== i); // read the same way twice or more
    const name =
        commonEnd(names) ||
        (known.length
            ? vote(
                known.map((post) => ({ post })),
                "post",
                () => 1,
            )
            : "") ||
        middle(names);
    if (name || code) out.post = name && code ? `${name} - ${toBn(code)}` : name || toBn(code);
    for (const k of PARTS) if (!out[k]) delete out[k];
    return out;
}

/**
 * The post office's name is the words right before the code; a misread "ডাকঘর:" label can leave junk in front
 * ("ভক্ত মোমেনশাহী সেনানিবাস"). The longest ending that at least half the readings share (a letter or two may differ)
 * is the name.
 */
function commonEnd(names) {
    const lists = names.map((n) => n.split(/\s+/).filter(Boolean).map(key));
    if (lists.length < 2) return "";
    const same = (a, b) => distance(a, b) <= Math.max(1, Math.floor([...a].length / 4));
    const need = Math.max(2, Math.ceil(lists.length / 2));
    let best = null;
    lists.forEach((ws, i) => {
        for (let k = 1; k <= ws.length; k++) {
            const end = ws.slice(-k);
            const support = lists.filter((o) => o.length >= k && o.slice(-k).every((w, j) => same(w, end[j]))).length;
            if (support < need || !end.every((w) => wordOk(w))) continue;
            if (!best || k > best.k || (k === best.k && support > best.support))
                best = { k, support, text: names[i].split(/\s+/).filter(Boolean).slice(-k).join(" ") };
        }
    });
    return best ? best.text : "";
}

/**
 * Free text read 3+ times with the same number of words: each word is chosen on its own — the version closest to the
 * other readings' word in that place ("গেসন্ডা / গেডা / গেডা / গেষন্ডা" → "গেডা"; "গ্রন্দা / গেন্দা / গেন্দা" → "গেন্দা").
 * Each reading gets different letters wrong, so this is better than taking any one reading whole.
 */
function wordByWord(vals) {
    const split = (v) => v.split(/\s*,\s*|\s+/).filter(Boolean);
    const groups = new Map();
    for (const v of vals) {
        const n = split(v).length;
        groups.set(n, [...(groups.get(n) || []), v]);
    }
    const [n, list] = [...groups.entries()].sort((a, b) => b[1].length - a[1].length || b[0] - a[0])[0] || [0, []];
    if (list.length < 3 || n === 0) return "";
    const rows = list.map(split);
    const commas = split(list[0]).map((_, i) => {
        // keep the commas where most readings have them
        const withComma = list.filter((v) => {
            const parts = v.split(/\s+/);
            return /,$/.test(parts[i] || "");
        }).length;
        return withComma * 2 > list.length;
    });
    const words = [];
    for (let i = 0; i < n; i++) {
        const options = rows.map((r) => r[i]);
        let best = options[0];
        let bestD = Infinity;
        for (const o of options) {
            if (!wordOk(o) && !/^[০-৯/\-]+$/.test(o)) continue;
            const t = options.reduce((sum, x) => sum + distance(key(o), key(x)), 0);
            if (t < bestD) [best, bestD] = [o, t];
        }
        if (bestD === Infinity) return "";
        words.push(best + (commas[i] && i < n - 1 ? "," : ""));
    }
    return words.join(" ");
}

/** Free text read several times → the reading whose words the other readings agree with most. */
function agreed(vals) {
    const list = vals.filter(Boolean);
    if (list.length <= 1) return list[0] || "";
    const words = list.map((v) =>
        v
            .split(/[\s,]+/)
            .filter(Boolean)
            .map(key),
    );
    let best = "";
    let bestScore = -Infinity;
    let bestAgreed = -1;
    words.forEach((ws, i) => {
        let score = 0;
        let ok = 0;
        for (const w of ws) {
            const room = Math.max(1, Math.floor([...w].length / 3));
            const seen = words.some((other, j) => j !== i && other.some((o) => distance(w, o) <= room));
            if (seen && (wordOk(w) || /^[০-৯/\-]+$/.test(w))) {
                score += 1;
                ok += 1;
            } else score -= 1;
        }
        if (score > bestScore || (score === bestScore && ok > bestAgreed)) [best, bestScore, bestAgreed] = [list[i], score, ok];
    });
    return bestScore > 0 ? best : "";
}

/** The address parts as one line, the card's way (to show what was read). */
export const addressLine = (a) =>
    [
        a.house && `বাসা/হোল্ডিং: ${a.house}`,
        a.village && `গ্রাম/রাস্তা: ${a.village}`,
        a.post && `ডাকঘর: ${a.post}`,
        a.upazila,
        a.district,
    ]
        .filter(Boolean)
        .join(", ");