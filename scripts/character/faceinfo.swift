import Foundation
import Vision
import CoreImage

let args = CommandLine.arguments
guard args.count == 2 else { exit(2) }
guard let ci = CIImage(contentsOf: URL(fileURLWithPath: args[1])) else { print("ERR load"); exit(1) }
let W = ci.extent.width, H = ci.extent.height

let handler = VNImageRequestHandler(ciImage: ci, options: [:])
let req = VNDetectFaceLandmarksRequest()
do {
    try handler.perform([req])
    guard let f = req.results?.first else { print("ERR no-face"); exit(1) }
    let bb = f.boundingBox   // normalized, origin bottom-left
    let fw = bb.width * W, fh = bb.height * H
    // Vision 좌표(하단 기준) → 이미지 좌표(상단 기준)
    let topY = (1 - bb.maxY) * H
    let cx = bb.midX * W
    var ipd = -1.0
    if let lm = f.landmarks, let le = lm.leftPupil?.normalizedPoints.first,
       let re = lm.rightPupil?.normalizedPoints.first {
        // 눈 좌표는 얼굴 bbox 기준 정규화값
        let lx = (bb.minX + le.x * bb.width) * W, ly = (bb.minY + le.y * bb.height) * H
        let rx = (bb.minX + re.x * bb.width) * W, ry = (bb.minY + re.y * bb.height) * H
        ipd = ((lx-rx)*(lx-rx) + (ly-ry)*(ly-ry)).squareRoot()
    }
    print(String(format: "faceW=%.1f faceH=%.1f faceTopY=%.1f faceCX=%.1f ipd=%.1f yaw=%@ roll=%@",
                 fw, fh, topY, cx, ipd,
                 f.yaw.map { String(format: "%.3f", $0.doubleValue) } ?? "nil",
                 f.roll.map { String(format: "%.3f", $0.doubleValue) } ?? "nil"))
} catch { print("ERR \(error)"); exit(1) }
