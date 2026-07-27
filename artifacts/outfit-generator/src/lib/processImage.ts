/**
 * Image Processing Pipeline
 *
 * This module is the designated seam for clothing photo processing.
 *
 * Current behaviour (v1):
 *   encodeToPng(file) — re-encodes any camera JPEG or image file to a
 *   normalised PNG.  This is the only function called by the upload flow.
 *
 * To re-enable AI background removal in a future update:
 *   1. In QuickAddSheet.tsx → handleFile, replace:
 *        const png = await encodeToPng(file);
 *      with:
 *        const png = await processClothingImage(file);
 *      (pass an onProgress callback as the second arg when you restore
 *       the progress UI)
 *   2. Restore the "bg-removing" and "bg-failed" phases in QuickAddSheet.
 *   3. The full pipeline below (removeBackground → cropAndCenterPng) is
 *      already implemented and ready to use — no changes needed here.
 *
 * Background removal uses @imgly/background-removal (browser-side, no API
 * key).  Model files (~5 MB, isnet_quint8) stream from jsDelivr on first
 * call and are cached by the browser thereafter.
 *
 * NOTE: The library's resources.json ships empty, so the built-in progress
 * callback never fires with total > 0.  Callers should drive their own
 * progress UI (e.g. a decelerating ramp) independently.
 *
 * THREADING FIX (iOS / WKWebView):
 *   The entire removeBackground() call runs inside a dedicated Web Worker
 *   (bgRemovalWorker.ts) so ONNX inference never touches the main JS thread.
 *   This replaces the earlier Object.defineProperty/proxy approach, which
 *   required ORT's own proxy worker file to be served from the same origin —
 *   that file isn't available locally and caused every inference to throw.
 *   The worker is terminated immediately on completion or cancellation,
 *   which also gives us true cancellation (no wasted CPU after "Keep Original").
 */

// Module-level handle so cancelBackgroundRemoval() can reach the live worker.
let _activeWorker: Worker | null = null;

/**
 * Terminate any in-flight background-removal worker immediately.
 * Safe to call even when no removal is running.
 * Called by ItemDetailsSheet when the user taps "Keep Original" mid-process.
 */
export function cancelBackgroundRemoval(): void {
  if (_activeWorker) {
    _activeWorker.terminate();
    _activeWorker = null;
  }
}

/** Spawn a worker, run removeBackground, resolve with the raw PNG blob. */
function runRemovalInWorker(
  blob: Blob,
  onProgress?: ProgressCallback,
): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    const worker = new Worker(
      new URL("./bgRemovalWorker.ts", import.meta.url),
      { type: "module" },
    );
    _activeWorker = worker;

    worker.onmessage = (ev) => {
      const msg = ev.data as
        | { type: "progress"; current: number; total: number }
        | { type: "done"; blob: Blob }
        | { type: "error"; message: string };

      if (msg.type === "progress") {
        onProgress?.(
          msg.total > 0
            ? Math.min(80, Math.round((msg.current / msg.total) * 80))
            : -1,
        );
      } else if (msg.type === "done") {
        _activeWorker = null;
        worker.terminate();
        resolve(msg.blob);
      } else {
        _activeWorker = null;
        worker.terminate();
        reject(new Error(msg.message));
      }
    };

    worker.onerror = (err) => {
      _activeWorker = null;
      worker.terminate();
      reject(new Error(err.message ?? "Worker error"));
    };

    worker.postMessage({ blob });
  });
}

export type ProgressCallback = (percent: number) => void;

/** Rejects with TimeoutError when bg removal exceeds the allowed duration. */
export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Background removal timed out after ${ms / 1000}s`);
    this.name = "TimeoutError";
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new TimeoutError(ms)), ms);
    promise.then(
      (v) => { clearTimeout(id); resolve(v); },
      (e) => { clearTimeout(id); reject(e); },
    );
  });
}

/**
 * Encode a File/Blob to PNG via canvas.
 *
 * Used by the v1 upload flow to normalise camera JPEGs before storing.
 * Preserves the original dimensions; does NOT remove the background.
 */
export async function encodeToPng(input: File | Blob): Promise<Blob> {
  const url = URL.createObjectURL(input);
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = rej;
      img.src = url;
    });
    const cvs = document.createElement("canvas");
    cvs.width  = img.naturalWidth;
    cvs.height = img.naturalHeight;
    cvs.getContext("2d")!.drawImage(img, 0, 0);
    return await new Promise<Blob>((res, rej) =>
      cvs.toBlob(
        (b) => (b ? res(b) : rej(new Error("canvas.toBlob failed"))),
        "image/png",
      )
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Full pipeline: bg removal → tight crop → square transparent PNG.
 *
 * Not called by the v1 upload flow.  Ready to be wired back in —
 * see the module-level comment for instructions.
 *
 * Rejects with TimeoutError after `timeoutMs` milliseconds (default 90 s).
 */
export async function processClothingImage(
  input: File | Blob,
  onProgress?: ProgressCallback,
  timeoutMs = 90_000,
): Promise<Blob> {
  const run = async () => {
    // Runs entirely in a Web Worker — main thread stays free during inference.
    const bgFree = await runRemovalInWorker(input, onProgress);
    onProgress?.(-1); // pulse: inference done, cropping next
    return cropAndCenterPng(bgFree);
  };

  return withTimeout(run(), timeoutMs);
}

// ── Internal ──────────────────────────────────────────────────────────────────

async function cropAndCenterPng(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);

  const analysisCanvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = analysisCanvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
  ctx.drawImage(bitmap, 0, 0);

  const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  const { data, width, height } = imageData;

  let minX = width, minY = height, maxX = 0, maxY = 0;
  let hasContent = false;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > 8) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        hasContent = true;
      }
    }
  }

  if (!hasContent) return blob;

  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;
  const pad   = Math.round(Math.max(cropW, cropH) * 0.06);
  const size  = Math.max(cropW, cropH) + pad * 2;

  const out    = new OffscreenCanvas(size, size);
  const outCtx = out.getContext("2d") as OffscreenCanvasRenderingContext2D;

  outCtx.drawImage(
    analysisCanvas,
    minX, minY, cropW, cropH,
    Math.round((size - cropW) / 2),
    Math.round((size - cropH) / 2),
    cropW, cropH,
  );

  return out.convertToBlob({ type: "image/png", quality: 1 });
}
