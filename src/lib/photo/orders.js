// src/lib/photo/orders.js
// One-tap orders that studios print most often (Auto passport photo and Passport photo sheet).
// An order = the sizes printed for every photo: [{ sizeId, copies }] (sizeId from sizes.js photoSizes).

const mix = (pp, st) => [
    { sizeId: "passport", copies: pp },
    { sizeId: "stamp", copies: st },
];

export const orderPresets = [
    { label: "4 passport", order: [{ sizeId: "passport", copies: 4 }] },
    { label: "5 passport (1 row)", order: [{ sizeId: "passport", copies: 5 }] },
    { label: "4 passport + 2 stamp", order: mix(4, 2) },
    { label: "3 passport + 4 stamp", order: mix(3, 4) },
    { label: "4 passport + 4 stamp", order: mix(4, 4) },
    { label: "8 passport", order: [{ sizeId: "passport", copies: 8 }] },
    { label: "25 passport (full A4)", order: [{ sizeId: "passport", copies: 25 }] },
    { label: "8 stamp", order: [{ sizeId: "stamp", copies: 8 }] },
    { label: "4 e-passport / visa", order: [{ sizeId: "e-passport", copies: 4 }] },
    { label: "2 square visa", order: [{ sizeId: "us-visa", copies: 2 }] },
];

/** Same sizes and copies (to show which chip is chosen). */
export const sameOrder = (a, b) =>
    a.length === b.length && a.every((r, i) => r.sizeId === b[i].sizeId && r.copies === b[i].copies);

/** A saved order that is still usable. */
export const validOrder = (o) =>
    Array.isArray(o) && o.length > 0 && o.length <= 4 && o.every((r) => typeof r?.sizeId === "string" && Number.isFinite(r.copies));