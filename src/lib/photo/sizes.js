// src/lib/photo/sizes.js
// All sizes in millimetres. Output is rendered at 300 DPI.

export const DPI = 300;
export const PX_PER_MM = DPI / 25.4; // 11.811…

/** mm → pixels at 300 DPI */
export const mmToPx = (mm, pxPerMm = PX_PER_MM) => Math.round(mm * pxPerMm);

/** Photo sizes used in Bangladesh studios. */
export const photoSizes = [
  { id: "passport", label: "Passport", detail: "1.5 × 1.9 in · 38 × 48 mm", w: 38, h: 48 },
  { id: "passport-40", label: "Passport (40 × 50)", detail: "40 × 50 mm", w: 40, h: 50 },
  { id: "e-passport", label: "E-passport / visa", detail: "45 × 55 mm", w: 45, h: 55 },
  { id: "stamp", label: "Stamp", detail: "0.8 × 1 in · 20 × 25 mm", w: 20, h: 25 },
  { id: "us-visa", label: "Square visa", detail: "2 × 2 in · 51 × 51 mm", w: 51, h: 51 },
  { id: "custom", label: "Custom size", detail: "Any size in mm", w: 38, h: 48 },
];

export const paperSizes = [
  { id: "a4", label: "A4", detail: "210 × 297 mm", w: 210, h: 297 },
  { id: "4r", label: "4R photo paper", detail: "4 × 6 in", w: 101.6, h: 152.4 },
  { id: "3r", label: "3R photo paper", detail: "3.5 × 5 in", w: 88.9, h: 127 },
  { id: "5r", label: "5R photo paper", detail: "5 × 7 in", w: 127, h: 177.8 },
  { id: "a5", label: "A5", detail: "148 × 210 mm", w: 148, h: 210 },
  { id: "letter", label: "Letter", detail: "8.5 × 11 in", w: 215.9, h: 279.4 },
  { id: "legal", label: "Legal (LG)", detail: "8.5 × 14 in", w: 215.9, h: 355.6 },
];

export const getPhotoSize = (id) => photoSizes.find((s) => s.id === id) ?? photoSizes[0];
export const getPaper = (id) => paperSizes.find((p) => p.id === id) ?? paperSizes[0];

/** ID-1 card (NID, smart card, bank card): 85.6 × 54 mm */
export const ID_CARD = { w: 85.6, h: 54 };
