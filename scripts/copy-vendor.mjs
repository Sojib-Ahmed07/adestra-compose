// scripts/copy-vendor.mjs
// Copies browser files that must be served as plain files into public/vendor:
// PDF.js worker + fonts, qpdf WASM, OCR (tesseract.js worker, engine, Bangla/English language data), Avro phonetic,
// and the photo AI: ONNX Runtime (WASM), the MODNet background-removal model and MediaPipe Face Mesh.
// Runs automatically after `npm install` and before `npm run dev` / `npm run build`.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "vendor");
const nm = join(root, "node_modules");

const copies = [
  ["pdfjs-dist/build/pdf.worker.min.mjs", "pdfjs/pdf.worker.min.mjs"],
  ["pdfjs-dist/cmaps", "pdfjs/cmaps"],
  ["pdfjs-dist/standard_fonts", "pdfjs/standard_fonts"],
  ["pdfjs-dist/wasm", "pdfjs/wasm"],
  ["pdfjs-dist/iccs", "pdfjs/iccs"],
  ["@neslinesli93/qpdf-wasm/dist/qpdf.js", "qpdf/qpdf.js"],
  ["@neslinesli93/qpdf-wasm/dist/qpdf.wasm", "qpdf/qpdf.wasm"],
  ["tesseract.js/dist/worker.min.js", "tesseract/worker.min.js"],
  ["tesseract.js-core/tesseract-core-lstm.wasm.js", "tesseract/core/tesseract-core-lstm.wasm.js"],
  ["tesseract.js-core/tesseract-core-simd-lstm.wasm.js", "tesseract/core/tesseract-core-simd-lstm.wasm.js"],
  ["tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js", "tesseract/core/tesseract-core-relaxedsimd-lstm.wasm.js"],
  ["@tesseract.js-data/ben/4.0.0_best_int/ben.traineddata.gz", "tesseract/lang/ben.traineddata.gz"],
  ["@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz", "tesseract/lang/eng.traineddata.gz"],
  ["avro-phonetic/src/avro-lib.js", "avro/avro-lib.js"],
  ["onnxruntime-web/dist/ort.wasm.min.mjs", "ort/ort.wasm.min.mjs"],
  ["onnxruntime-web/dist/ort-wasm-simd-threaded.mjs", "ort/ort-wasm-simd-threaded.mjs"],
  ["onnxruntime-web/dist/ort-wasm-simd-threaded.wasm", "ort/ort-wasm-simd-threaded.wasm"],
  ["@dloizides/background-removal/models/modnet.onnx", "models/modnet.onnx"],
  ["@dloizides/background-removal/models/NOTICE.md", "models/NOTICE.md"],
  ["@mediapipe/face_mesh", "facemesh"],
];

let missing = 0;
for (const [from, to] of copies) {
  const src = join(nm, from);
  if (!existsSync(src)) {
    console.warn(`[vendor] missing ${from} — run npm install`);
    missing++;
    continue;
  }
  const dest = join(out, to);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true });
}
if (!missing) console.log("[vendor] PDF, OCR, typing and photo AI files copied to public/vendor");
