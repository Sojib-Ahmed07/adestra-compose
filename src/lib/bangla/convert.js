// src/lib/bangla/convert.js
// Bijoy (SutonnyMJ and other "MJ" fonts) ↔ Unicode for typed/pasted text.
// Engine: bijoy-unicode-converter (MIT) for both directions — tested on hard conjuncts (ক্ষ, জ্ঞ, র‍্য, র্ধ্ব…).
import { ConvertToASCII, ConvertToUnicode } from "bijoy-unicode-converter";

/** Bijoy text (looks like "Avwg evsjvq") → Unicode ("আমি বাংলায়"). Line breaks are kept. */
export function bijoyToUnicode(text) {
  return String(text ?? "")
    .split("\n")
    .map((line) => (line ? ConvertToUnicode("bijoy", line) : line))
    .join("\n");
}

/** Unicode Bangla → Bijoy text, ready to paste into a SutonnyMJ text box (Photoshop, Illustrator, old Word files). */
export function unicodeToBijoy(text) {
  return String(text ?? "")
    .split("\n")
    .map((line) => (line ? ConvertToASCII("bijoy", line) : line))
    .join("\n");
}

const BANGLA = /[ঀ-৿]/;

/** Rough guess of what the pasted text is, to pick the direction automatically. */
export function detectEncoding(text) {
  const s = String(text ?? "");
  if (!s.trim()) return "empty";
  if (BANGLA.test(s)) return "unicode";
  // Bijoy text is ASCII full of typical letters/symbols used for Bangla shapes.
  const sample = s.slice(0, 2000);
  const marks = (
    sample.match(/[†‡©¨ª«¯°±²³´µ¶·¸¹º»¼½¾¿ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿ…—–`]/g) || []
  ).length;
  const words = sample.split(/\s+/).filter(Boolean);
  const bijoyish = words.filter((w) => /^(Av|Ki|Kv|ev|wk|†|‡|w[a-zA-Z])/.test(w) || /[Ö¨ª©×Ÿ]/.test(w)).length;
  return marks > 2 || bijoyish / Math.max(1, words.length) > 0.3 ? "bijoy" : "english";
}

/** Word, character and line counts for Bangla or English text. */
export function textStats(text) {
  const s = String(text ?? "");
  const words = s.trim() ? s.trim().split(/\s+/).length : 0;
  const chars = [...s.replace(/\s/g, "")].length;
  const lines = s ? s.split("\n").length : 0;
  return { words, chars, lines };
}

/** File types the document converter accepts (Bijoy → Unicode). */
export const docTypes = ".docx,.odt,.rtf,.txt,.html,.htm";

/**
 * Convert a whole Word/ODT/RTF/TXT/HTML file from Bijoy to Unicode (fonts are switched to a Unicode font).
 * Runs in the browser. Returns { blob, name }.
 * @param {File} file
 * @param {{ force?: boolean, onProgress?: (p: { stage: string, percent: number }) => void }} [opts]
 *   force: convert every run even if its font isn't a Bijoy font (for files typed in Times New Roman etc.)
 */
export async function convertBijoyFile(file, opts = {}) {
  const lib = await import("bijoy2unicode/docx");
  if (!lib.detectExt(file.name))
    throw new Error(
      `“${file.name}” can't be converted. Use a .docx, .odt, .rtf, .txt or .html file (save old .doc files as .docx first).`,
    );
  const { blob, filename } = await lib.convertFile(file, { force: Boolean(opts.force), onProgress: opts.onProgress });
  return { blob, name: filename };
}
