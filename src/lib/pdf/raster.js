// src/lib/pdf/raster.js
// Browser-only: turn PDF pages into pictures (for PDF → images and for compressing scanned PDFs).
import { PDFDocument } from "pdf-lib";
import { canvasToBlob } from "@/lib/photo/export";
import { closeDoc, openForRender, renderPage } from "./engine";

/**
 * Rebuild a PDF with every page as a JPEG at `dpi`. Page sizes stay the same.
 * Text stops being selectable — best for scans and photos of documents.
 * @param {Uint8Array} bytes
 * @param {{ dpi: number, quality: number, grey?: boolean, onProgress?: (done: number, total: number) => void }} opts
 */
export async function rasterizePdf(bytes, { dpi, quality, grey = false, onProgress }) {
  const doc = await openForRender(bytes);
  try {
    const out = await PDFDocument.create();
    out.setProducer("Shop tools");
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const vp = page.getViewport({ scale: 1, rotation: page.rotate }); // size in points, as displayed
      let canvas = await renderPage(doc, n, { scale: dpi / 72 });
      if (grey) {
        const g = document.createElement("canvas");
        g.width = canvas.width;
        g.height = canvas.height;
        const ctx = g.getContext("2d");
        ctx.filter = "grayscale(1)";
        ctx.drawImage(canvas, 0, 0);
        canvas = g;
      }
      const jpg = await canvasToBlob(canvas, "image/jpeg", quality);
      const img = await out.embedJpg(await jpg.arrayBuffer());
      out.addPage([vp.width, vp.height]).drawImage(img, { x: 0, y: 0, width: vp.width, height: vp.height });
      canvas.width = canvas.height = 0; // free memory early
      onProgress?.(n, doc.numPages);
    }
    return await out.save({ useObjectStreams: true });
  } finally {
    closeDoc(doc);
  }
}
