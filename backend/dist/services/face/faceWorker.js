"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Face engine, run as a child process by faceService so the model's memory (~500 MB while
 * loaded) stays out of the API server and is released when the engine goes idle.
 *
 * Message in:  { id, jpeg: Uint8Array }
 * Message out: { id, ok: true, width, height, faces: [{ score, box, descriptor }] }
 *            | { id, ok: false, error }
 */
const path_1 = __importDefault(require("path"));
const tf = __importStar(require("@tensorflow/tfjs"));
const tfjs_backend_wasm_1 = require("@tensorflow/tfjs-backend-wasm");
const faceapi = __importStar(require("@vladmandic/face-api/dist/face-api.node-wasm.js"));
const jpeg_js_1 = __importDefault(require("jpeg-js"));
const MODEL_DIR = path_1.default.join(path_1.default.dirname(require.resolve('@vladmandic/face-api/package.json')), 'model');
const WASM_DIR = path_1.default.join(path_1.default.dirname(require.resolve('@tensorflow/tfjs-backend-wasm/package.json')), 'dist') + path_1.default.sep;
const MIN_DETECTION_SCORE = 0.5;
let ready = null;
function init() {
    if (!ready) {
        ready = (async () => {
            (0, tfjs_backend_wasm_1.setWasmPaths)(WASM_DIR);
            await tf.setBackend('wasm');
            await tf.ready();
            await faceapi.nets.ssdMobilenetv1.loadFromDisk(MODEL_DIR);
            await faceapi.nets.faceLandmark68Net.loadFromDisk(MODEL_DIR);
            await faceapi.nets.faceRecognitionNet.loadFromDisk(MODEL_DIR);
        })();
    }
    return ready;
}
async function describe(bytes) {
    await init();
    // Limits keep a malformed or huge upload from exhausting memory.
    const img = jpeg_js_1.default.decode(Buffer.from(bytes), {
        useTArray: true,
        formatAsRGBA: false,
        maxResolutionInMP: 6,
        maxMemoryUsageInMB: 96,
    });
    const tensor = tf.tensor3d(img.data, [img.height, img.width, 3], 'int32');
    try {
        const results = await faceapi
            .detectAllFaces(tensor, new faceapi.SsdMobilenetv1Options({ minConfidence: MIN_DETECTION_SCORE }))
            .withFaceLandmarks()
            .withFaceDescriptors();
        return {
            width: img.width,
            height: img.height,
            faces: results.map(r => ({
                score: r.detection.score,
                box: { x: r.detection.box.x, y: r.detection.box.y, width: r.detection.box.width, height: r.detection.box.height },
                descriptor: Array.from(r.descriptor),
            })),
        };
    }
    finally {
        tensor.dispose();
    }
}
process.on('message', async (msg) => {
    try {
        const result = await describe(msg.jpeg);
        process.send?.({ id: msg.id, ok: true, ...result });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        process.send?.({ id: msg.id, ok: false, error: message });
    }
});
// If the API server goes away, don't linger.
process.on('disconnect', () => process.exit(0));
