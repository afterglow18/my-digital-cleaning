/**
 * Web Worker — Background Removal
 *
 * Runs @imgly/background-removal entirely off the main thread so the UI
 * stays responsive during the 5–30 s ONNX inference window.
 *
 * Running inside a worker means we don't need ORT's built-in proxy flag
 * (which required its own worker file served from the same origin and
 * caused path-resolution failures).  We just need numThreads = 1 because
 * iOS Safari has no SharedArrayBuffer and WASM multithreading would crash.
 */
import { removeBackground } from "@imgly/background-removal";

const CDN_VERSION = "1.7.0";
const PUBLIC_PATH =
  `https://cdn.jsdelivr.net/npm/@imgly/background-removal@${CDN_VERSION}/dist/web/`;

// Configure ORT once — single-threaded for iOS Safari compatibility.
async function setupOrt() {
  try {
    // @ts-ignore — types.d.ts exists but isn't wired through package.json "exports"
    const ort = await import("onnxruntime-web");
    ort.env.wasm.numThreads = 1;
  } catch {
    // Best-effort — inference will still run, possibly with wrong thread count.
  }
}

let _setup: Promise<void> | null = null;

self.onmessage = async (ev: MessageEvent<{ blob: Blob }>) => {
  if (!_setup) _setup = setupOrt();
  await _setup;

  try {
    const result = await removeBackground(ev.data.blob, {
      publicPath: PUBLIC_PATH,
      model: "isnet_quint8",
      output: { format: "image/png", quality: 1 },
      progress: (_key: string, current: number, total: number) => {
        self.postMessage({ type: "progress", current, total });
      },
    });
    self.postMessage({ type: "done", blob: result });
  } catch (err) {
    self.postMessage({ type: "error", message: String(err) });
  }
};
