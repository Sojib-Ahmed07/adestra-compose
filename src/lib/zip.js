// src/lib/zip.js
import { zipSync } from "fflate";

/**
 * Put files into one ZIP (stored without re-compressing: PDFs and images are already compressed).
 * @param {{ name: string, blob: Blob }[]} files
 * @returns {Promise<Blob>}
 */
export async function zipFiles(files) {
  const entries = {};
  const used = new Set();
  for (const f of files) {
    let name = f.name;
    for (let i = 2; used.has(name); i++) name = f.name.replace(/(\.[^.]+)?$/, `-${i}$1`);
    used.add(name);
    entries[name] = [new Uint8Array(await f.blob.arrayBuffer()), { level: 0 }];
  }
  return new Blob([zipSync(entries)], { type: "application/zip" });
}
