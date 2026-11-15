// src/lib/deeds/templates.js
// The shop's own deed templates (from the owner's Word files, Nov 2026). Each template says:
//   people  — the parties (১ম পক্ষ, ২য় পক্ষ, জামিনদার …), filled with the person form
//   fields  — the other details (amounts, dates, vehicle …)
//   texts   — the long paragraphs and the conditions, written from the fields; staff can change any of them
//   blocks  — the whole deed as blocks for the page engine (components/deeds/deed-pages.jsx)
// Wording follows the owner's files (a few obvious typing mistakes fixed). Amount words and dates are worked out.
import { bnWords } from "@/lib/number-words";
import { bn, bnDate, countText, endOfTerm, money, moneyWords, nameOf, personText, takaText, todayIso, two } from "./format";

/**
 * Blocks (sizes are multiples of the body font size):
 *   { t: "p", text, align?: "justify"|"center"|"right"|"left", size?, bold?, underline?, gap?, keep? }
 *   { t: "box", lines: string[] }                      small bordered box on the right (summary under the title)
 *   { t: "party", text, label, labelAlign?, bold? }     a person + their role, kept together
 *   { t: "clause", n, text }                           numbered condition (hanging number)
 *   { t: "table", rows: [label, value][] }
 *   { t: "sign", title, witnesses, right: { row, label }[] }   witnesses on the left, party signatures on the right
 *   { t: "break" }                                     start a new stamp sheet (when "keep the template's pages" is on)
 * keep = keep with the next block. gap = space after, in lines.
 */

const P = (text, o = {}) => ({ t: "p", text, ...o });
const bismillah = (size = 1) => P("বিসমিল্লাহির রাহমানির রাহিম", { align: "center", size, bold: true, gap: 0.2 });

const num = (v, d = 0) => {
    const n = Number(String(v ?? "").replace(/[০-৯]/g, (c) => "০১২৩৪৫৬৭৮৯".indexOf(c)));
    return Number.isFinite(n) && n > 0 ? n : d;
};

// ——— 1. Office / shop rent ———

const placeKinds = {
    অফিস: { ti: "অফিসটি", er: "অফিসের" },
    দোকান: { ti: "দোকানটি", er: "দোকানের" },
    দোকানঘর: { ti: "দোকানঘরটি", er: "দোকানঘরের" },
    গোডাউন: { ti: "গোডাউনটি", er: "গোডাউনের" },
};

const officeRent = {
    id: "office-rent",
    title: "অফিস / দোকান ভাড়ার চুক্তিপত্র",
    hint: "মালিক ও ভাড়াটিয়া, অগ্রিম জামানত, মাসিক ভাড়া, মেয়াদ, তফসিল",
    font: 12,
    people: [
        { key: "owner", label: "প্রথম পক্ষ (মালিক)" },
        { key: "tenant", label: "দ্বিতীয় পক্ষ (ভাড়াটিয়া)" },
    ],
    fields: [
        { key: "kind", label: "কী ভাড়া", type: "select", options: Object.keys(placeKinds), default: "অফিস" },
        { key: "start", label: "শুরুর তারিখ", type: "date", default: () => todayIso() },
        { key: "years", label: "মেয়াদ (বছর)", type: "number", default: "5" },
        { key: "advance", label: "অগ্রিম জামানত (টাকা)", type: "money", default: "" },
        { key: "rent", label: "মাসিক ভাড়া (টাকা)", type: "money", default: "" },
        { key: "payFrom", label: "ভাড়া দেওয়ার শুরু (মাসের তারিখ)", type: "number", default: "1" },
        { key: "payTo", label: "ভাড়া দেওয়ার শেষ (মাসের তারিখ)", type: "number", default: "10" },
        { key: "dueMonths", label: "কত মাস বকেয়া হলে বাতিল", type: "number", default: "3" },
        { key: "noticeMonths", label: "ছাড়ার নোটিশ (মাস)", type: "number", default: "3" },
        { key: "district", label: "জেলা (তফসিল)", type: "text", default: "" },
        { key: "thana", label: "থানা (তফসিল)", type: "text", default: "" },
        { key: "business", label: "ব্যবসার ধরণ / নাম", type: "text", default: "" },
        {
            key: "place",
            label: "তফসিল — ঠিকানা ও বিবরণ",
            type: "textarea",
            default: "",
            hint: "যেমনঃ গেন্ডা, এ ১৭/১, পশ্চিম-দক্ষিণ দিক থেকে ৫ নং পাকা অফিস যাহা উত্তর মুখি তিন দিকে পাকা এক দিকে সাটার বিশিষ্ট ঘর।",
        },
        { key: "witnesses", label: "সাক্ষী কতজন", type: "number", default: "5" },
    ],
    texts(d) {
        const k = placeKinds[d.kind] ?? placeKinds["অফিস"];
        const X = d.kind || "অফিস";
        const adv = takaText(d.advance);
        const end = endOfTerm(d.start, num(d.years, 1));
        return [
            {
                id: "intro",
                label: "শুরুর অংশ",
                text: `পরম করুণাময় মহান আল্লাহ্ তায়ালার নাম স্মরণ করিয়া অত্র মাসিক ${X} ভাড়ার চুক্তিপত্রের বর্ণনা আরম্ভ করিতেছি। যেহেতু আমি প্রথম পক্ষ নিম্ন তফসিল বর্ণিত ${X}টির মালিক দখলকার। আমি প্রথম পক্ষ আমার ${k.ti} মাসিক ভাড়ার প্রস্তাব করিলে আপনি দ্বিতীয় পক্ষ ভাড়াটিয়া ${adv} অগ্রিম জামানত প্রদান করিয়া মাসিক ভাড়া প্রদান করিতে ইচ্ছুক হইলে উভয় পক্ষের আলাপ আলোচনার মাধ্যমে নিম্নে বর্ণিত শর্তে তফসিলে বর্ণিত ${X} ভাড়ার চুক্তিপত্র দলিল সহি সম্পাদন করিলাম।`,
            },
            {
                id: "c1",
                clause: true,
                text: `বর্ণিত ${X} চুক্তিপত্রের মেয়াদ অদ্যকার ${bnDate(d.start)} ইং হইতে কার্যকর থাকিয়া আগামী ${bnDate(end)} ইং পর্যন্ত অর্থাৎ মোট ${bn(num(d.years, 1))} (${bnWords(num(d.years, 1))}) বৎসর পর্যন্ত বলবৎ থাকিবে।`,
            },
            {
                id: "c2",
                clause: true,
                text: `আমি প্রথম পক্ষ মালিক, দ্বিতীয় পক্ষ ভাড়াটিয়ার নিকট হইতে নিম্নে উপস্থিত স্বাক্ষরকারী স্বাক্ষীগণের মোকাবেলায় ${adv} অগ্রিম জামানত হিসাবে গ্রহণ করিলাম। যাহা অত্র চুক্তিপত্রের মেয়াদ শেষে আমি প্রথম পক্ষ, দ্বিতীয় পক্ষের বরাবরে এককালীন নগদে পরিশোধ করিব।`,
            },
            {
                id: "c3",
                clause: true,
                text: `অত্র ${k.er} মাসিক ভাড়া ${takaText(d.rent)} ধার্য করা হইল যাহা ইংরেজী মাসের ক্যালেন্ডার অনুযায়ী চলতি মাসের ভাড়া মাসের ${two(d.payFrom)} তারিখ হইতে ${two(d.payTo)} তারিখের মধ্যে দ্বিতীয় পক্ষ প্রথম পক্ষের বরাবরে পরিশোধ করিবেন।`,
            },
            {
                id: "c4",
                clause: true,
                text: `অত্র ${X}ে ব্যবহৃত বিদ্যুৎ, পানি, ময়লা ও অন্যান্য বিল দ্বিতীয় পক্ষ/ভাড়াটিয়া নিয়মিতভাবে পরিশোধ করিবেন।`,
            },
            {
                id: "c5",
                clause: true,
                text: `তফসিল বর্ণিত ${X}ে কোন প্রকার অবৈধ ব্যবসা করিতে পারিবে না। কোন প্রকার রাজনৈতিক কর্মকান্ড বা কোন প্রকার দাহ্য পদার্থ রাখিতে পারিবে না ইহাতে ${k.er} কোন প্রকার ক্ষতি হইলে ইহার দায়ভার এবং ক্ষতিপূরণ দ্বিতীয় পক্ষ/ভাড়াটিয়া নিজ দায়িত্বে ঠিক/বহন করিয়া দিতে বাধ্য থাকিবে এবং চুক্তিপত্র বাতিল বলিয়া গণ্য হইবে।`,
            },
            {
                id: "c6",
                clause: true,
                text: `অত্র ${k.er} সাটার ও ${k.er} ক্ষতি হইলে তাহা দ্বিতীয় পক্ষ/ভাড়াটিয়া নিজ দায়িত্বে ঠিক করিয়া দিতে বাধ্য থাকিবে।`,
            },
            {
                id: "c7",
                clause: true,
                text: `অত্র চুক্তিপত্রের মেয়াদ শেষে উভয় পক্ষের আলোচনা সাপেক্ষে নতুন করিয়া চুক্তিপত্রের মেয়াদ নবায়ন করা যাইতে পারে। সেক্ষেত্রে ভাড়া ও জামানত বৃদ্ধির ব্যাপারে আলোচনার মাধ্যমে গৃহীত হইবে। চুক্তিপত্রের মেয়াদ নবায়ন না হইলে উক্ত তারিখে চুক্তিপত্রের মেয়াদ বাতিল হইবে এবং ${X} খালি করিয়া প্রথম পক্ষের নিকট দখল বুঝাইয়া দিবেন।`,
            },
            {
                id: "c8",
                clause: true,
                text: `পরপর ${countText(num(d.dueMonths, 3))} মাসের ভাড়া বকেয়া পরিশোধ করিতে ব্যর্থ হইলে এই চুক্তিপত্র বাতিল হইবে।`,
            },
            {
                id: "c9",
                clause: true,
                text: `অত্র ${k.er} মালিক/প্রথম পক্ষের বিশেষ প্রয়োজন হইলে কিংবা পুনঃ নির্মাণ অথবা কোন উন্নয়নের প্রয়োজনে দ্বিতীয় পক্ষকে ${countText(num(d.noticeMonths, 3))} মাসের অগ্রীম নোটিশ দিলে দ্বিতীয় পক্ষ ${k.ti} ছাড়িয়া দিতে বাধ্য থাকিবে। তদ্রুপ দ্বিতীয় পক্ষের ${k.ti} ছাড়িয়া দেওয়ার প্রয়োজনীয়তা দেখা দিলে দ্বিতীয় পক্ষ প্রথম পক্ষকে ${countText(num(d.noticeMonths, 3))} মাসের লিখিত নোটিশ দিয়া অবগত করাইতে হইবে।`,
            },
            {
                id: "c10",
                clause: true,
                text: `দ্বিতীয় পক্ষ ভাড়াটিয়া ${k.ti} অন্য কোন তৃতীয় পক্ষের নিকট হস্তান্তর করিতে পারিবে না বা সাবলেট ভাড়া দিতে পারিবে না।`,
            },
            {
                id: "c11",
                clause: true,
                text: `আমি প্রথম পক্ষ জামানত বাবদ ${adv} দ্বিতীয় পক্ষ ${k.ti} ছাড়িয়া দেওয়ার সময় ${k.ti} অক্ষত অবস্থায় বুঝিয়া পাইয়া দ্বিতীয় পক্ষকে এককালীন ফেরৎ দিতে বাধ্য থাকিব। কোন প্রকার বকেয়া থাকিলে জামানত হইতে কর্তন করা হইবে।`,
            },
            {
                id: "schedule",
                label: "তফসিল",
                text: `জেলা-${d.district || "........"}, থানা-${d.thana || "........"}, ${d.place || "................................"} যাহা অত্র মাসিক ভাড়াটিয়া চুক্তিপত্র দ্বারা ভাড়াকৃত বটে।`,
            },
            {
                id: "closing",
                label: "শেষের অংশ",
                text: "এতদ্বারা স্বেচ্ছায়, স্বজ্ঞানে, সুস্থ শরীরে, সরল মনে অন্যের বিনা প্ররোচনায় অত্র চুক্তিপত্র আমরা উভয় পক্ষ পাঠ করিয়া উহার মর্মার্থ অবগত হইয়া অদ্য রোজ হাজিরান মজলিশে উপস্থিত স্বাক্ষীগণের মোকাবেলায় আমরা পক্ষগণ আমাদের নিজ নিজ নাম সহি সম্পাদন করিলাম।",
            },
        ];
    },
    blocks(d, T) {
        const X = d.kind || "অফিস";
        const k = placeKinds[X] ?? placeKinds["অফিস"];
        const years = num(d.years, 1);
        const box = [
            `জেলা-${d.district || "........"}, থানা-${d.thana || "........"},`,
            "মাসিক ভাড়াটিয়া চুক্তিপত্র দলিলের",
            `মেয়াদ ${two(years)} (${bnWords(years)}) বছর।`,
            `অগ্রিম বাবদ-${money(d.advance) || "........"} (${moneyWords(d.advance) || "........"}) টাকা।`,
        ];
        if (d.business) box.push(`ব্যবসার ধরণঃ “${d.business}”`);
        const w = Math.max(1, Math.min(9, num(d.witnesses, 5)));
        return [
            bismillah(),
            P(`*** ${X} ভাড়ার চুক্তিপত্র দলিল ***`, { align: "center", size: 1.6, bold: true, underline: true, gap: 0.4 }),
            { t: "box", lines: box },
            { t: "party", text: personText(d.owner, { sep: "-" }), label: "প্রথম পক্ষ (মালিক)" },
            { t: "party", text: personText(d.tenant, { sep: "-" }), label: "দ্বিতীয় পক্ষ (ভাড়াটিয়া)" },
            P(T.intro, { gap: 0.5 }),
            P("** শর্তাবলী **", { align: "center", bold: true, underline: true, keep: true }),
            ...T.clauses.map((text, i) => ({ t: "clause", n: i + 1, text })),
            P(`ভাড়াকৃত ${k.er} তফসিল পরিচয়`, { align: "center", bold: true, underline: true, keep: true }),
            P(T.schedule),
            P(T.closing, { gap: 0.8 }),
            {
                t: "sign",
                title: "স্বাক্ষীগণের স্বাক্ষরঃ",
                witnesses: w,
                right: [
                    { row: 0, label: "প্রথম পক্ষের (মালিকের) স্বাক্ষর" },
                    { row: w - 1, label: "দ্বিতীয় পক্ষের (ভাড়াটিয়ার) স্বাক্ষর" },
                ],
            },
        ];
    },
};

// ——— 2. Money lending (হাওলাদনামা) ———

const moneyLend = {
    id: "money-lend",
    title: "হাওলাদনামা (টাকা ধার)",
    hint: "দাতা, গ্রহিতা, জামিনদার, টাকার পরিমাণ, মাসিক লাভ, ফেরতের সময়",
    font: 16,
    people: [
        { key: "giver", label: "১ম পক্ষ (দাতা)" },
        { key: "taker", label: "২য় পক্ষ (গ্রহিতা)" },
        { key: "guarantor", label: "জামিনদার", optional: true },
    ],
    fields: [
        { key: "date", label: "তারিখ", type: "date", default: () => todayIso() },
        { key: "amount", label: "টাকার পরিমাণ", type: "money", default: "" },
        { key: "returnDays", label: "চাইলে কত দিনের মধ্যে ফেরত", type: "number", default: "30" },
        { key: "profit", label: "মাসিক লাভ (টাকা) — না থাকলে খালি", type: "money", default: "" },
        { key: "profitDay", label: "লাভ দেওয়ার তারিখ (প্রতি মাসের)", type: "number", default: "2" },
    ],
    texts(d) {
        const giver = nameOf(d.giver);
        const taker = nameOf(d.taker);
        const amt = takaText(d.amount);
        const hasG = Boolean(d.guarantor?.name);
        const list = [
            {
                id: "intro",
                label: "শুরুর অংশ",
                text: `পরম করুণাময় মহান আল্লাহ তাআলার নাম স্মরণ করিয়া নগদ টাকা গ্রহণের চুক্তিনামা দলিলের বর্ণনা লিখিতে আরম্ভ করিলাম। আমি দ্বিতীয় পক্ষ ${taker} প্রয়োজনের জন্য প্রথম পক্ষ ${giver} এর নিকট হইতে নগদ ${amt} নিম্নে শর্ত সাপেক্ষে গ্রহণ করিলাম।`,
            },
            {
                id: "c1",
                clause: true,
                text: `${bnDate(d.date)} ইং তারিখে ${amt} ১ম পক্ষ ${giver} ২য় পক্ষ ${taker} কে দিবে। ১ম পক্ষ তার সম্পূর্ণ ${amt} যেকোন সময় চাইলে ২য় পক্ষ তাহা ${countText(num(d.returnDays, 30))} দিনের মধ্যে দিতে বাধ্য থাকিবে${hasG ? `, এবং উক্ত টাকা ২য় পক্ষ দিতে না পারিলে বা অস্বীকার করিলে জামিনদার (${nameOf(d.guarantor)}) দিতে বাধ্য থাকিবে` : ""}।`,
            },
        ];
        if (money(d.profit)) {
            list.push({
                id: "c2",
                clause: true,
                text: `উক্ত ${amt}য় প্রতি মাসে ${takaText(d.profit)} লাভের অংশ প্রতি মাসের ${bn(num(d.profitDay, 2))} তারিখে পরিশোধ করিতে বাধ্য থাকিব।`,
            });
        }
        list.push(
            { id: "c3", clause: true, text: "উক্ত টাকা পরিশোধ না করিতে পারিলে আইনানুগ ব্যবস্থা গ্রহণ করিতে পারিবেন।" },
            {
                id: "closing",
                label: "শেষের অংশ",
                text: `এতদার্থে আমরা উভয়পক্ষগণ স্বেচ্ছায়, সজ্ঞানে, সুস্থ শরীরে, অন্যের বিনা প্ররোচনায় অত্র হাওলাদনামার সকল শর্ত পড়িয়া, অন্যের দ্বারা পড়াইয়া উহার মর্মার্থ অবগত হইয়া অত্র হাওলাদনামায় নিজ নাম সহি স্বাক্ষর করিলাম। ইতি, তারিখঃ ${bnDate(d.date)} ইং।`,
            },
        );
        return list;
    },
    blocks(d, T) {
        const hasG = Boolean(d.guarantor?.name);
        const right = [
            { row: 0, label: "১ম পক্ষ দাতার স্বাক্ষর" },
            { row: 2, label: "২য় পক্ষ গ্রহিতার স্বাক্ষর" },
        ];
        if (hasG) right.push({ row: 4, label: "জামিনদারের স্বাক্ষর" });
        return [
            bismillah(),
            P("“হাওলাদনামা”", { align: "center", size: 1.25, bold: true, gap: 0.6 }),
            { t: "party", text: personText(d.giver, { sep: ":", namePrefix: true }), label: "১ম পক্ষ দাতা" },
            { t: "party", text: personText(d.taker, { sep: ":", namePrefix: true }), label: "২য় পক্ষ গ্রহিতা" },
            ...(hasG ? [{ t: "party", text: personText(d.guarantor, { sep: ":", namePrefix: true }), label: "জামিনদার" }] : []),
            P(T.intro, { gap: 0.5 }),
            { t: "break" },
            P("শর্তাবলী", { align: "center", size: 1.25, bold: true, underline: true, keep: true, gap: 0.4 }),
            ...T.clauses.map((text, i) => ({ t: "clause", n: i + 1, text })),
            { t: "break" },
            P(T.closing, { gap: 1 }),
            { t: "sign", title: "সাক্ষীগণের স্বাক্ষরঃ", witnesses: hasG ? 5 : 3, right },
        ];
    },
};

// ——— 3. Used auto-rickshaw sale, 3 sheets ———

const vehicleSale = {
    id: "vehicle-sale",
    title: "পুরাতন অটো-রিক্সা / গাড়ী বিক্রয় চুক্তিপত্র",
    hint: "বিক্রেতা, ক্রেতা, গাড়ীর বিবরণ, মূল্য, মালিকানা হস্তান্তরের তারিখ (৩ ফর্দ)",
    font: 16,
    people: [
        { key: "seller", label: "প্রথম পক্ষ (বিক্রেতা)" },
        { key: "buyer", label: "দ্বিতীয় পক্ষ (ক্রেতা)" },
    ],
    fields: [
        { key: "vehicle", label: "যানের শ্রেণী", type: "text", default: "অটো-রিক্সা" },
        { key: "maker", label: "প্রস্তুতকারক", type: "text", default: "" },
        { key: "colour", label: "গাড়ীর রং", type: "text", default: "" },
        { key: "battery", label: "ব্যাটারী", type: "text", default: "" },
        { key: "extra", label: "অন্যান্য বিবরণ (চেসিস / রেজি. নং ইত্যাদি)", type: "text", default: "" },
        { key: "price", label: "বিক্রয় মূল্য (টাকা)", type: "money", default: "" },
        { key: "date", label: "মালিকানা হস্তান্তরের তারিখ", type: "date", default: () => todayIso() },
        { key: "witnesses", label: "সাক্ষী কতজন", type: "number", default: "3" },
    ],
    texts(d) {
        const V = d.vehicle || "অটো-রিক্সা";
        const dt = bnDate(d.date);
        return [
            {
                id: "intro",
                label: "শুরুর অংশ",
                text: `পরম করুণাময় মহান আল্লাহ পাকের নাম স্মরণ করিয়া অত্র ${V} বিক্রয়ের চুক্তিনামা দলিলের বর্ণনা আরম্ভ করিলাম। যাহা নিম্নে বর্ণিত শর্ত সাপেক্ষে সম্মত হইলে আমরা উভয় পক্ষ অত্র ${V} বিক্রির চুক্তি পত্র দলিল লিখিয়া নিয়া এই মর্মে স্বীকার ও অঙ্গীকার করিতেছি যে, আমরা উভয় পক্ষ নিম্ন শর্ত মানিয়া চলিতে বাধ্য থাকিব ইহার অন্যথা করিব না, করিলে আইনত দণ্ডনীয় হইবে।`,
            },
            {
                id: "c1",
                clause: true,
                text: `চুক্তি মোতাবেক ২য় পক্ষ প্রথম পক্ষকে গাড়ী বিক্রির নগদ ${takaText(d.price)} পরিশোধ করিয়া দিয়েছেন।`,
            },
            {
                id: "c2",
                clause: true,
                text: `${dt} ইং হইতে গাড়ীর মালিকানা প্রথম পক্ষ দাবী করিতে পারিবেন না, গাড়ীর সম্পূর্ণ মালিক দ্বিতীয় পক্ষ।`,
            },
            {
                id: "c3",
                clause: true,
                text: `${dt} ইং এর পর কোন প্রকার মামলা মোকদ্দমা হইলে প্রথম পক্ষ বিক্রেতা কোন দায় ভার নিবে না।`,
            },
            {
                id: "c4",
                clause: true,
                text: `${dt} ইং তারিখের পূর্বে গাড়ীর নামে কোন মামলা বা কোন প্রকার জটিলতা থাকিলে তা প্রথম পক্ষ নিজ দায়িত্বে সমাধান করিয়া দিবেন।`,
            },
            {
                id: "c5",
                clause: true,
                text: "গাড়ীর কাগজ পত্র তৈরি করিতে ১ম পক্ষ ২য় পক্ষকে সব রকম সাহায্য সহযোগিতা করিবেন।",
            },
            {
                id: "closing",
                label: "শেষের অংশ",
                text: "এতদার্থে, স্বেচ্ছায়, সজ্ঞানে, সুস্থ শরীরে অন্যের বিনা প্ররোচনায় আমরা উভয় পক্ষ গাড়ী বিক্রয় চুক্তিপত্র পড়িয়া, বুঝিয়া এবং মানিয়া লইয়া এবং উভয় পক্ষ রাজী হইয়া নিম্নোক্ত স্বাক্ষীগণের সম্মুখে আমাদের নিজ নিজ নাম সহি করিলাম।",
            },
        ];
    },
    blocks(d, T, ctx) {
        const V = d.vehicle || "অটো-রিক্সা";
        const rows = [["যানের শ্রেণী:", V]];
        if (d.maker) rows.push(["প্রস্তুতকারক:", d.maker]);
        if (d.colour) rows.push(["গাড়ীর রং:", d.colour]);
        if (d.battery) rows.push(["ব্যাটারী:", d.battery]);
        if (d.extra) rows.push(["অন্যান্য:", bn(d.extra)]);
        const w = Math.max(1, Math.min(9, num(d.witnesses, 3)));
        return [
            bismillah(),
            P(`*** পুরাতন ${V} বিক্রয় চুক্তিপত্র দলিল ***`, { align: "center", size: 1.15, bold: true, underline: true, gap: 0.5 }),
            { t: "party", text: personText(d.seller), label: "প্রথম পক্ষ (বিক্রেতা)", bold: true },
            { t: "party", text: personText(d.buyer), label: "দ্বিতীয় পক্ষ (ক্রেতা)", bold: true },
            P(T.intro),
            { t: "break" },
            P("গাড়ীর বিবরণ", { align: "center", size: 1.25, bold: true, underline: true, keep: true, gap: 0.3 }),
            { t: "table", rows: rows.map(([a, b], i) => [`${bn(i + 1)}। ${a}`, b]) },
            ...T.clauses.map((text, i) => ({ t: "clause", n: i + 1, text })),
            { t: "break" },
            P(T.closing),
            P(`ইতি তাং- ${bnDate(d.date)} ইং`, { gap: 0.8 }),
            {
                t: "sign",
                title: "স্বাক্ষীগণের স্বাক্ষরঃ",
                witnesses: w,
                right: [
                    { row: 0, label: "প্রথম পক্ষের স্বাক্ষর (বিক্রেতা)" },
                    { row: w - 1, label: "দ্বিতীয় পক্ষের স্বাক্ষর (ক্রেতা)" },
                ],
            },
            P(`অত্র চুক্তিপত্র দলিল ${bn(ctx.pages)} (${bnWords(ctx.pages)}) ফর্দে টাইপকৃত এবং স্বাক্ষী ${countText(w)} জন রহিল।`, {
                align: "center",
                size: 0.8,
            }),
        ];
    },
};

// ——— 4. Auto-rickshaw buy-sell, 1 sheet ———

const vehicleSaleShort = {
    id: "vehicle-sale-1",
    title: "অটো রিকশা ক্রয়-বিক্রয় চুক্তিনামা (১ পাতা)",
    hint: "ছোট চুক্তিনামা — বিক্রেতা, ক্রেতা, মূল্য, রং, ব্যাটারী",
    font: 12,
    people: [
        { key: "seller", label: "১ম পক্ষ (বিক্রেতা)" },
        { key: "buyer", label: "২য় পক্ষ (ক্রেতা)" },
    ],
    fields: [
        { key: "count", label: "কয়টি", type: "number", default: "1" },
        { key: "vehicle", label: "যানের ধরণ", type: "text", default: "পুরাতন অটো রিকশা" },
        { key: "colour", label: "রং", type: "text", default: "" },
        { key: "battery", label: "ব্যাটারী", type: "text", default: "" },
        { key: "price", label: "মূল্য (টাকা)", type: "money", default: "" },
        { key: "pay", label: "পরিশোধ", type: "select", options: ["নগদে", "কিস্তিতে", "আংশিক নগদে"], default: "নগদে" },
        { key: "date", label: "তারিখ", type: "date", default: () => todayIso() },
    ],
    texts(d) {
        const V = d.vehicle || "পুরাতন অটো রিকশা";
        const n = bn(num(d.count, 1));
        const list = [
            {
                id: "intro",
                label: "মূল অংশ",
                text: `পরম করুণাময় আল্লাহর নাম স্মরণ করিয়া অত্র ${n} টি ${V} ক্রয় ও বিক্রয়ের চুক্তিনামা দলিলের বর্ণনা আরম্ভ করিলাম। যেহেতু আমি প্রথম পক্ষের স্বত্ব দখলীয় ${n} টি ${V}${d.colour ? ` (${d.colour} রঙের)` : ""} ${takaText(d.price)}য় ${d.pay || "নগদে"} বিক্রয় করার প্রস্তাব করিলে আপনি দ্বিতীয় পক্ষ উহা ক্রয় করার ইচ্ছা প্রকাশ করিলে আমরা উভয় পক্ষদ্বয়ের মধ্যে আলাপ আলোচনার সাপেক্ষে নিম্ন বর্ণিত শর্তাবলীসমূহ উভয় পক্ষ মানিয়া নিয়া অত্র ক্রয়-বিক্রয়ের চুক্তিনামা স্বাক্ষর করিয়া আমি দ্বিতীয় পক্ষ ক্রয় করিলাম এবং আমি প্রথম পক্ষ আপনি দ্বিতীয় পক্ষের নিকট বিক্রয় করিলাম।`,
            },
            { id: "c1", clause: true, text: `${V}র মূল্য ${money(d.price) || "........"} টাকা।` },
            { id: "c2", clause: true, text: `${V}টি ${d.pay || "নগদে"} ক্রয় করা হইল।` },
        ];
        if (d.colour) list.push({ id: "c3", clause: true, text: `রংঃ ${d.colour}` });
        if (d.battery) list.push({ id: "c4", clause: true, text: `ব্যাটারীঃ ${d.battery}` });
        return list;
    },
    blocks(d, T) {
        const V = d.vehicle || "পুরাতন অটো রিকশা";
        return [
            bismillah(0.9),
            P(`${bn(num(d.count, 1))} টি ${V} ক্রয়-বিক্রয়ের চুক্তিনামা`, {
                align: "center",
                size: 1.3,
                bold: true,
                underline: true,
                gap: 0.4,
            }),
            { t: "party", text: personText(d.seller), label: "***১ম পক্ষ (বিক্রেতা)***", labelAlign: "left" },
            { t: "party", text: personText(d.buyer), label: "***২য় পক্ষ (ক্রেতা)***", labelAlign: "left" },
            P(T.intro, { gap: 0.4 }),
            ...T.clauses.map((text, i) => ({ t: "clause", n: i + 1, text, bold: true })),
            P(`তারিখঃ ${bnDate(d.date)} ইং`, { gap: 0.6 }),
            {
                t: "sign",
                title: "সাক্ষীগণের স্বাক্ষরঃ",
                witnesses: 3,
                right: [
                    { row: 0, label: "১ম পক্ষের স্বাক্ষর" },
                    { row: 2, label: "২য় পক্ষের স্বাক্ষর" },
                ],
            },
        ];
    },
};

export const deedTemplates = [officeRent, moneyLend, vehicleSale, vehicleSaleShort];
export const getTemplate = (id) => deedTemplates.find((t) => t.id === id);

/** A fresh form for a template. */
export function emptyDeed(tpl, emptyPerson) {
    const d = { edits: {}, extra: [], removed: [] };
    for (const p of tpl.people) d[p.key] = emptyPerson();
    for (const f of tpl.fields) d[f.key] = typeof f.default === "function" ? f.default() : (f.default ?? "");
    return d;
}

/**
 * The texts with the staff's changes: edited texts win, removed conditions are left out, added ones come last.
 * @returns {{ list: { id, label?, clause?, text, auto: string, edited: boolean }[], byId: object, clauses: string[] }}
 */
export function resolveTexts(tpl, d) {
    const list = tpl.texts(d).map((x) => {
        const edited = typeof d.edits?.[x.id] === "string";
        return { ...x, auto: x.text, text: edited ? d.edits[x.id] : x.text, edited };
    });
    const byId = Object.fromEntries(list.filter((x) => !x.clause).map((x) => [x.id, x.text]));
    const removed = new Set(d.removed || []);
    const clauses = [
        ...list.filter((x) => x.clause && !removed.has(x.id)).map((x) => x.text),
        ...(d.extra || []).filter((t) => t && t.trim()),
    ];
    return { list, byId, clauses };
}

/** All blocks for printing. ctx.pages = how many sheets (for "৩ (তিন) ফর্দে"). */
export function buildDeed(tpl, d, ctx = { pages: 1 }) {
    const T = resolveTexts(tpl, d);
    return tpl.blocks(d, { ...T.byId, clauses: T.clauses }, ctx);
}