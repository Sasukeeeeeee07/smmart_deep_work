/**
 * Face engine, run as a child process by faceService so the model's memory (~500 MB while
 * loaded) stays out of the API server and is released when the engine goes idle.
 *
 * Message in:  { id, jpeg: Uint8Array }
 * Message out: { id, ok: true, width, height, faces: [{ score, box, descriptor }] }
 *            | { id, ok: false, error }
 */
import path from 'path';
import * as tf from '@tensorflow/tfjs';
import { setWasmPaths } from '@tensorflow/tfjs-backend-wasm';
import * as faceapi from '@vladmandic/face-api/dist/face-api.node-wasm.js';
import jpeg from 'jpeg-js';

const MODEL_DIR = path.join(path.dirname(require.resolve('@vladmandic/face-api/package.json')), 'model');
const WASM_DIR = path.join(path.dirname(require.resolve('@tensorflow/tfjs-backend-wasm/package.json')), 'dist') + path.sep;
const MIN_DETECTION_SCORE = 0.5;

let ready: Promise<void> | null = null;

function init(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      setWasmPaths(WASM_DIR);
      await tf.setBackend('wasm');
      await tf.ready();
      await faceapi.nets.ssdMobilenetv1.loadFromDisk(MODEL_DIR);
      await faceapi.nets.faceLandmark68Net.loadFromDisk(MODEL_DIR);
      await faceapi.nets.faceRecognitionNet.loadFromDisk(MODEL_DIR);
    })();
  }
  return ready;
}

async function describe(bytes: Uint8Array) {
  await init();
  // Limits keep a malformed or huge upload from exhausting memory.
  const img = jpeg.decode(Buffer.from(bytes), {
    useTArray: true,
    formatAsRGBA: false,
    maxResolutionInMP: 6,
    maxMemoryUsageInMB: 96,
  });
  const tensor = tf.tensor3d(img.data, [img.height, img.width, 3], 'int32');
  try {
    const results = await faceapi
      .detectAllFaces(tensor as any, new faceapi.SsdMobilenetv1Options({ minConfidence: MIN_DETECTION_SCORE }))
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
  } finally {
    tensor.dispose();
  }
}

process.on('message', async (msg: { id: number; jpeg: Uint8Array }) => {
  try {
    const result = await describe(msg.jpeg);
    process.send?.({ id: msg.id, ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.send?.({ id: msg.id, ok: false, error: message });
  }
});

// If the API server goes away, don't linger.
process.on('disconnect', () => process.exit(0));
