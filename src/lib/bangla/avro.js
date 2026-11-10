// src/lib/bangla/avro.js
// Avro phonetic (Banglish → Bangla), browser only. The engine is the unmodified jsAvroPhonetic file (MPL-1.1)
// served from /vendor/avro/avro-lib.js (copied by scripts/copy-vendor.mjs).

let loading;

/** @returns {Promise<{ parse: (text: string) => string }>} */
export function loadAvro() {
  loading ??= new Promise((resolve, reject) => {
    if (window.OmicronLab?.Avro?.Phonetic) return resolve(window.OmicronLab.Avro.Phonetic);
    const s = document.createElement("script");
    s.src = "/vendor/avro/avro-lib.js";
    s.async = true;
    s.onload = () => {
      const p = window.OmicronLab?.Avro?.Phonetic;
      if (p) resolve(p);
      else {
        loading = undefined;
        reject(new Error("The typing engine didn't load. Reload the page."));
      }
    };
    s.onerror = () => {
      loading = undefined;
      reject(new Error("The typing engine didn't load. Run `npm run vendor`, then reload the page."));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/** Characters Avro converts (Latin letters, digits and its few symbols). Bangla and spaces are left alone. */
export const AVRO_RUN = /[A-Za-z0-9`^:,.$]+$/;

/** Examples shown on the page — every one checked against the engine. */
export const avroGuide = [
  ["ami", "আমি"],
  ["sOnar", "সোনার"],
  ["bangladesh", "বাংলাদেশ"],
  ["sohoj", "সহজ"],
  ["jIbon", "জীবন"],
  ["Sikkha", "শিক্ষা"],
  ["raShTro", "রাষ্ট্র"],
  ["korrmo", "কর্ম"],
  ["proyOjon", "প্রয়োজন"],
  ["bishwobidyaloy", "বিশ্ববিদ্যালয়"],
  ["krriShok", "কৃষক"],
  ["du:kho", "দুঃখ"],
  ["ca^d", "চাঁদ"],
  ["ut``sob", "উৎসব"],
  ["rZab", "র‍্যাব"],
  ["Dhaka · Taka", "ঢাকা · টাকা"],
];

/** Letters whose sound changes with a capital or a special key. */
export const avroKeys = [
  ["O", "ও"],
  ["I / U", "ঈ / ঊ"],
  ["OI / OU", "ঐ / ঔ"],
  ["T / Th", "ট / ঠ"],
  ["D / Dh", "ড / ঢ"],
  ["R", "ড়"],
  ["N", "ণ"],
  ["S / Sh", "শ / ষ"],
  ["c / ch", "চ / ছ"],
  ["ng / Ng", "ং / ঙ"],
  ["z / y", "য / য়"],
  ["kkh / gg", "ক্ষ / জ্ঞ"],
  ["rri", "ঋ / ৃ"],
  ["rr", "র্ (রেফ)"],
  [":", "ঃ"],
  ["^", "ঁ"],
  ["``", "ৎ"],
  [".", "।"],
];
