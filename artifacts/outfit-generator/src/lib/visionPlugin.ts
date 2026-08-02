/**
 * Capacitor bridge for the native iOS VisionPlugin.
 *
 * On iOS the plugin runs:
 *   - VNClassifyImageRequest (confidence ≥ 0.3)
 *   - VNRecognizeTextRequest (accurate mode)
 * on a background queue and returns labels + recognized text.
 *
 * On web a no-op fallback is registered so the import never throws.
 */

import { registerPlugin } from "@capacitor/core";

export interface VisionPlugin {
  analyzeImage(options: { imageData: string }): Promise<{ labels: string[]; text: string[] }>;
}

// Web fallback: always returns empty arrays — the web path uses canvas color
// extraction instead of Vision, so this branch is never meaningfully called.
const webFallback: VisionPlugin = {
  analyzeImage: async () => ({ labels: [], text: [] }),
};

export const VisionPlugin = registerPlugin<VisionPlugin>("VisionPlugin", {
  web: () => webFallback,
});
