import Capacitor
import Vision
import UIKit

/**
 * VisionPlugin — Capacitor bridge exposing iOS Vision analysis to the web layer.
 *
 * analyzeImage({ imageData: "<base64 JPEG>" }) → { labels: string[], text: string[] }
 *
 * Runs VNClassifyImageRequest (confidence ≥ 0.3) and VNRecognizeTextRequest
 * (accurate mode) synchronously on a background queue.
 * Falls back silently to empty arrays on any error.
 */
@objc(VisionPlugin)
public class VisionPlugin: CAPPlugin, CAPBridgedPlugin {

    public let identifier    = "VisionPlugin"
    public let jsName        = "VisionPlugin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "analyzeImage", returnType: CAPPluginReturnPromise),
    ]

    @objc func analyzeImage(_ call: CAPPluginCall) {
        guard
            let base64 = call.getString("imageData"),
            let data   = Data(base64Encoded: base64),
            let uiImg  = UIImage(data: data),
            let cgImg  = uiImg.cgImage
        else {
            call.resolve(["labels": [String](), "text": [String]()])
            return
        }

        DispatchQueue.global(qos: .userInitiated).async {
            var labels = [String]()
            var texts  = [String]()
            let group  = DispatchGroup()

            // ── VNClassifyImageRequest ────────────────────────────────────────
            group.enter()
            let classifyReq = VNClassifyImageRequest { req, err in
                defer { group.leave() }
                guard err == nil,
                      let obs = req.results as? [VNClassificationObservation]
                else { return }
                labels = obs
                    .filter { $0.confidence >= 0.3 }
                    .map    { $0.identifier }
            }

            // ── VNRecognizeTextRequest ────────────────────────────────────────
            group.enter()
            let textReq = VNRecognizeTextRequest { req, err in
                defer { group.leave() }
                guard err == nil,
                      let obs = req.results as? [VNRecognizedTextObservation]
                else { return }
                texts = obs.compactMap { $0.topCandidates(1).first?.string }
            }
            textReq.recognitionLevel = .accurate

            let handler = VNImageRequestHandler(cgImage: cgImg, options: [:])
            try? handler.perform([classifyReq, textReq])
            group.wait()

            call.resolve(["labels": labels, "text": texts])
        }
    }
}
