import path from 'path';
import { fork, ChildProcess } from 'child_process';

export interface DetectedFace {
  score: number;
  box: { x: number; y: number; width: number; height: number };
  descriptor: number[];
}

export interface DetectionResult {
  width: number;
  height: number;
  faces: DetectedFace[];
}

/**
 * Two face templates closer than this are the same person. face-api's usual cut-off is 0.6, but in
 * testing two different people in one photo scored 0.525, so the default is a stricter 0.45
 * (the same person across days typically scores 0.3–0.45). Tune with FACE_MATCH_THRESHOLD.
 */
export const MATCH_THRESHOLD = Number(process.env.FACE_MATCH_THRESHOLD) || 0.45;
/** Shut the engine down after this long without work, to give its memory back. */
const IDLE_SHUTDOWN_MS = 5 * 60 * 1000;
/** The first request also loads the model (a few seconds), so allow generously. */
const REQUEST_TIMEOUT_MS = 45 * 1000;

type Pending = { resolve: (r: DetectionResult) => void; reject: (e: Error) => void; timer: NodeJS.Timeout };

let child: ChildProcess | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();
let idleTimer: NodeJS.Timeout | null = null;

function failAll(err: Error) {
  for (const [id, p] of pending) {
    clearTimeout(p.timer);
    p.reject(err);
    pending.delete(id);
  }
}

function startEngine(): ChildProcess {
  if (child && child.connected) return child;
  // Same extension as this file: .ts under tsx in development, .js from dist in production.
  const workerPath = path.join(__dirname, `faceWorker${path.extname(__filename)}`);
  const proc = fork(workerPath, [], { execArgv: process.execArgv, serialization: 'advanced' });
  proc.on('message', (msg: any) => {
    const p = pending.get(msg?.id);
    if (!p) return;
    clearTimeout(p.timer);
    pending.delete(msg.id);
    if (msg.ok) p.resolve({ width: msg.width, height: msg.height, faces: msg.faces });
    else p.reject(new Error(msg.error || 'Face engine error'));
  });
  proc.on('exit', code => {
    if (child === proc) child = null;
    failAll(new Error(`Face engine stopped (exit code ${code})`));
  });
  proc.on('error', err => console.error('[FACE] engine error:', err));
  child = proc;
  console.log('[FACE] engine started');
  return proc;
}

function scheduleIdleShutdown() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (pending.size === 0 && child) {
      console.log('[FACE] engine idle, shutting down');
      child.disconnect();
      child = null;
    }
  }, IDLE_SHUTDOWN_MS);
}

/** Finds the faces in a JPEG and returns a 128-number template for each. */
export function detectFaces(jpeg: Buffer): Promise<DetectionResult> {
  const proc = startEngine();
  const id = nextId++;
  return new Promise<DetectionResult>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('Face engine timed out'));
    }, REQUEST_TIMEOUT_MS);
    pending.set(id, { resolve, reject, timer });
    proc.send({ id, jpeg: new Uint8Array(jpeg) });
  }).finally(scheduleIdleShutdown);
}

export function faceDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

/** Smallest distance between a probe template and any of the enrolled ones. */
export function bestDistance(probe: number[], enrolled: number[][]): number {
  return enrolled.reduce((min, d) => Math.min(min, faceDistance(probe, d)), Infinity);
}

/** Stops the engine (used on server shutdown and by tests). */
export function stopFaceEngine() {
  if (idleTimer) clearTimeout(idleTimer);
  if (child) {
    child.disconnect();
    child = null;
  }
}
