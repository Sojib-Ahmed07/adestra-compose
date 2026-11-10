// src/lib/pdf/engine.js
// Browser-only loaders for PDF.js (rendering pages) and qpdf (passwords). Files are served from /vendor
// (copied there by scripts/copy-vendor.mjs).

const PDFJS_BASE = "/vendor/pdfjs/";

let pdfjsPromise;
/** PDF.js, loaded on first use. */
export function getPdfjs() {
  pdfjsPromise ??= import("pdfjs-dist").then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}pdf.worker.min.mjs`;
    return pdfjs;
  });
  return pdfjsPromise;
}

/**
 * Open a PDF for rendering. A copy of the bytes is passed because PDF.js takes ownership of the buffer.
 * @param {Uint8Array} bytes
 * @param {string} [password]
 */
export async function openForRender(bytes, password) {
  const pdfjs = await getPdfjs();
  const task = pdfjs.getDocument({
    data: bytes.slice(),
    password,
    cMapUrl: `${PDFJS_BASE}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${PDFJS_BASE}standard_fonts/`,
    wasmUrl: `${PDFJS_BASE}wasm/`,
    iccUrl: `${PDFJS_BASE}iccs/`,
    isEvalSupported: false,
  });
  return task.promise;
}

/**
 * Render one page to a canvas.
 * @param {any} doc  PDF.js document
 * @param {number} pageNumber  1-based
 * @param {{ scale?: number, maxWidth?: number, rotation?: number, background?: string }} opts
 *   scale: 1 = 72 DPI. maxWidth wins if given. rotation: extra degrees on top of the page's own.
 */
export async function renderPage(doc, pageNumber, { scale, maxWidth, rotation = 0, background = "#ffffff" } = {}) {
  const page = await doc.getPage(pageNumber);
  const rot = (((page.rotate + rotation) % 360) + 360) % 360;
  const base = page.getViewport({ scale: 1, rotation: rot });
  const s = maxWidth ? maxWidth / base.width : (scale ?? 1);
  const viewport = page.getViewport({ scale: s, rotation: rot });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  await page.render({ canvas, viewport, background }).promise;
  page.cleanup();
  return canvas;
}

// ---------- qpdf ----------

let qpdfScript;
function loadQpdfScript() {
  qpdfScript ??= new Promise((resolve, reject) => {
    if (window.__qpdfCreate) return resolve(window.__qpdfCreate);
    const s = document.createElement("script");
    s.src = "/vendor/qpdf/qpdf.js";
    s.async = true;
    s.onload = () => {
      // The Emscripten file defines a global `Module` factory; keep it under our own name.
      window.__qpdfCreate = window.Module;
      resolve(window.__qpdfCreate);
    };
    s.onerror = () => {
      qpdfScript = undefined;
      reject(
        new Error(
          "Couldn't load the PDF password engine. Reload the page. If it keeps failing, run `npm install` again on the shop computer.",
        ),
      );
    };
    document.head.appendChild(s);
  });
  return qpdfScript;
}

/**
 * Run qpdf on one input file. Returns the output bytes, or throws with qpdf's message.
 * @param {Uint8Array} input
 * @param {(inPath: string, outPath: string) => string[]} makeArgs
 */
export async function runQpdf(input, makeArgs) {
  const create = await loadQpdfScript();
  const messages = [];
  // This qpdf build writes straight to console.log / console.error (bound when the module is created),
  // so capture the console while it runs to read qpdf's messages (e.g. "invalid password").
  const { log, error } = console;
  console.log = (...a) => messages.push(a.join(" "));
  console.error = (...a) => messages.push(a.join(" "));
  try {
    const q = await create({ noInitialRun: true, locateFile: () => "/vendor/qpdf/qpdf.wasm" });
    q.FS.writeFile("/in.pdf", input);
    let code;
    try {
      code = q.callMain(makeArgs("/in.pdf", "/out.pdf"));
    } catch (e) {
      code = typeof e?.status === "number" ? e.status : 2;
    }
    // 0 = ok, 3 = ok with warnings. 2 = error.
    if (code !== 0 && code !== 3) {
      const err = new Error(messages.join(" ") || `qpdf failed (${code})`);
      err.qpdf = messages.join("\n");
      throw err;
    }
    return q.FS.readFile("/out.pdf");
  } finally {
    console.log = log;
    console.error = error;
  }
}

/** Free a PDF.js document (and its worker memory). Safe to call twice or with null. */
export function closeDoc(doc) {
  try {
    doc?.loadingTask?.destroy();
  } catch {
    // already closed
  }
}
