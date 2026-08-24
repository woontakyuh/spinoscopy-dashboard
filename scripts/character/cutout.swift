import Foundation
import Vision
import CoreImage

let args = CommandLine.arguments
guard args.count == 3 else { FileHandle.standardError.write("usage: cutout <in.png> <out.png>\n".data(using: .utf8)!); exit(2) }
guard let ci = CIImage(contentsOf: URL(fileURLWithPath: args[1])) else { print("ERR load"); exit(1) }

let handler = VNImageRequestHandler(ciImage: ci, options: [:])
let req = VNGenerateForegroundInstanceMaskRequest()
do {
    try handler.perform([req])
    guard let res = req.results?.first else { print("ERR no-subject"); exit(1) }
    let buf = try res.generateMaskedImage(ofInstances: res.allInstances, from: handler, croppedToInstancesExtent: false)
    let out = CIImage(cvPixelBuffer: buf)
    let ctx = CIContext()
    try ctx.writePNGRepresentation(of: out, to: URL(fileURLWithPath: args[2]),
                                   format: .RGBA8, colorSpace: CGColorSpaceCreateDeviceRGB())
    print("OK \(Int(out.extent.width))x\(Int(out.extent.height)) instances=\(res.allInstances.count)")
} catch { print("ERR \(error)"); exit(1) }
