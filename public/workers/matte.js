// public/workers/matte.js
// Background removal worker. Runs the MODNet portrait-matting model with ONNX Runtime (WASM)
// so the page stays responsive. Files come from /vendor (copied by scripts/copy-vendor.mjs).
// Message in:  { id, width, height, pixels: Uint8ClampedArray (RGBA, already resized to a multiple of 32) }
// Message out: { id, matte: Float32Array (0–1, width × height) } or { id, error }
import * as ort from "/vendor/ort/ort.wasm.min.mjs";

ort.env.wasm.wasmPaths = "/vendor/ort/";
ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;

let session;
async function getSession() {
  if (!session) {
    session = ort.InferenceSession.create("/vendor/models/modnet.onnx", {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
    });
  }
  return session;
}

self.onmessage = async ({ data }) => {
  const { id, width, height, pixels } = data;
  try {
    const s = await getSession();
    if (!pixels) {
      self.postMessage({ id, ready: true });
      return;
    }
    const plane = width * height;
    const input = new Float32Array(plane * 3);
    for (let i = 0; i < plane; i++) {
      // MODNet expects RGB scaled to −1…1.
      input[i] = pixels[i * 4] / 127.5 - 1;
      input[plane + i] = pixels[i * 4 + 1] / 127.5 - 1;
      input[plane * 2 + i] = pixels[i * 4 + 2] / 127.5 - 1;
    }
    const tensor = new ort.Tensor("float32", input, [1, 3, height, width]);
    const out = await s.run({ [s.inputNames[0]]: tensor });
    const matte = new Float32Array(out[s.outputNames[0]].data);
    self.postMessage({ id, matte }, [matte.buffer]);
  } catch (err) {
    self.postMessage({ id, error: String(err?.message || err) });
  }
};
