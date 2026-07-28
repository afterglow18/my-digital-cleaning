/**
 * Web Worker — Background Removal
 *
 * Runs @imgly/background-removal entirely off the main thread so the UI
 * stays responsive during the 5–30 s ONNX inference window.
 *
 * publicPath is intentionally left unset so the library uses its built-in
 * default: https://staticimgly.com/@imgly/background-removal-data/{version}/dist/
 * (the old cdn.jsdelivr.net/dist/web/ path no longer exists in v1.7.0).
 *
 * numThreads is forced to 1 because iOS WKWebView has no SharedArrayBuffer
 * and WASM multithreading crashes there.
 */
import { removeBackground } from "@imgly/background-removal";

self.onmessage = async (ev: MessageEvent<{ blob: Blob }>) => {
  try {
    const result = await removeBackground(ev.data.blob, {
      // No publicPath — use the library's own staticimgly.com default
      model: "isnet_quint8",
      output: { format: "image/png", quality: 1 },
      // Force single-threaded WASM for iOS Safari / WKWebView
      // @ts-ignore — numThreads is a valid ORT option, not in the type sig
      numThreads: 1,
      progress: (_key: string, current: number, total: number) => {
        self.postMessage({ type: "progress", current, total });
      },
    });
    self.postMessage({ type: "done", blob: result });
  } catch (err) {
    self.postMessage({ type: "error", message: String(err) });
  }
};
