import { useEffect, useRef, useState } from 'react';
import { Camera, Check, Loader2, ScanFace, ShieldCheck, Upload, X, RotateCcw } from 'lucide-react';
import { faceService } from '../services/api';

/** Prompts shown while the photos are taken, so the templates cover a few angles. */
const POSES = ['Look straight at the camera', 'Turn your head slightly left', 'Turn your head slightly right', 'Lift your chin a little', 'Look straight again'];
const SHOT_INTERVAL_MS = 1300;
const MAX_SIDE = 640;

type Stage = 'intro' | 'camera' | 'checking' | 'done' | 'error';

/** Draws an image/video frame to a canvas no larger than MAX_SIDE and returns a JPEG data URL. */
function toJpeg(source: CanvasImageSource, width: number, height: number): string {
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext('2d')!.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85);
}

function fileToJpeg(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { resolve(toJpeg(img, img.naturalWidth, img.naturalHeight)); URL.revokeObjectURL(url); };
    img.onerror = () => { reject(new Error(`${file.name} could not be read as an image`)); URL.revokeObjectURL(url); };
    img.src = url;
  });
}

interface Props {
  /** Employee id, or 'me' for the signed-in user. */
  employeeId: string;
  employeeName: string;
  onClose: () => void;
  onEnrolled: (sampleCount: number) => void;
}

export default function FaceEnrollModal({ employeeId, employeeName, onClose, onEnrolled }: Props) {
  const [stage, setStage] = useState<Stage>('intro');
  const [consent, setConsent] = useState(false);
  const [shots, setShots] = useState<string[]>([]);
  const [poseIndex, setPoseIndex] = useState(0);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  };
  useEffect(() => stopCamera, []);

  const startCamera = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false });
      streamRef.current = stream;
      setShots([]);
      setPoseIndex(0);
      setStage('camera');
      // The <video> mounts with the camera stage; attach on the next frame.
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      });
    } catch {
      setError('Camera access was blocked or no camera was found. Allow camera access in your browser, or upload photos instead.');
    }
  };

  const submit = async (images: string[]) => {
    stopCamera();
    setStage('checking');
    setError('');
    try {
      const result = await faceService.enroll(employeeId, images, true);
      setStage('done');
      onEnrolled(result.sampleCount);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Face ID setup failed.');
      setStage('error');
    }
  };

  const captureSequence = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    setCapturing(true);
    const taken: string[] = [];
    for (let i = 0; i < POSES.length; i++) {
      setPoseIndex(i);
      await new Promise(r => setTimeout(r, SHOT_INTERVAL_MS));
      taken.push(toJpeg(video, video.videoWidth, video.videoHeight));
      setShots([...taken]);
    }
    setCapturing(false);
    await submit(taken);
  };

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (files.length < 3 || files.length > 8) {
      setError('Choose between 3 and 8 photos of the same person, each with only their face in it.');
      return;
    }
    try {
      const images = await Promise.all(Array.from(files).map(fileToJpeg));
      setShots(images);
      await submit(images);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const close = () => { stopCamera(); onClose(); };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(30, 32, 36, 0.4)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget && !capturing && stage !== 'checking') close(); }}
    >
      <div
        className="w-full animate-fade-up"
        style={{ maxWidth: 520, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, boxShadow: 'var(--shadow-xl)' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="face-enroll-title"
      >
        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2.5">
            <ScanFace size={18} style={{ color: 'var(--forest)' }} />
            <div>
              <h3 id="face-enroll-title" className="font-semibold" style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 16, color: 'var(--ink)' }}>
                Set up Face ID
              </h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--ink-4)' }}>{employeeName}</p>
            </div>
          </div>
          <button onClick={close} disabled={capturing || stage === 'checking'} className="btn btn-ghost p-1.5 rounded-lg" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {stage === 'intro' && (
            <>
              <p className="text-sm" style={{ color: 'var(--ink-2)', lineHeight: 1.55 }}>
                The DeepWork device checks the face of whoever presses Start. Only the person assigned to the desk can start a session.
              </p>
              <ul className="text-xs space-y-1.5" style={{ color: 'var(--ink-3)' }}>
                <li>• We take 5 photos from slightly different angles.</li>
                <li>• We store a numeric face template only. Photos are never saved.</li>
                <li>• You can remove your Face ID at any time from your Profile.</li>
              </ul>
              <label className="flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer select-none" style={{ borderColor: consent ? 'var(--sage-dark)' : 'var(--border)', background: 'var(--surface-2)' }}>
                <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-0.5" />
                <span className="text-xs" style={{ color: 'var(--ink-2)', lineHeight: 1.5 }}>
                  I agree that smmart DeepWork can store a face template of {employeeName} to confirm who is at the desk.
                </span>
              </label>
              {error && <p className="text-xs" role="alert" style={{ color: 'var(--error)' }}>{error}</p>}
              <div className="flex flex-wrap justify-end gap-2 pt-1">
                <input ref={fileRef} type="file" accept="image/jpeg,image/png" multiple hidden onChange={e => onFiles(e.target.files)} />
                <button type="button" disabled={!consent} onClick={() => fileRef.current?.click()} className="btn btn-secondary text-sm">
                  <Upload size={14} /> Upload photos
                </button>
                <button type="button" disabled={!consent} onClick={startCamera} className="btn btn-primary text-sm">
                  <Camera size={14} /> Use camera
                </button>
              </div>
            </>
          )}

          {stage === 'camera' && (
            <>
              <div className="relative overflow-hidden rounded-2xl" style={{ background: '#111', aspectRatio: '4 / 3' }}>
                <video ref={videoRef} muted playsInline className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />
                <div
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ width: '42%', height: '68%', border: '2px dashed rgba(255,255,255,0.7)', borderRadius: '50%' }}
                />
                <div className="absolute bottom-0 inset-x-0 px-4 py-3 text-center text-sm font-semibold text-white" style={{ background: 'linear-gradient(transparent, rgba(0,0,0,0.65))' }}>
                  {capturing ? `${POSES[poseIndex]} (${shots.length}/${POSES.length})` : 'Centre your face in the oval, in good light'}
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => { stopCamera(); setStage('intro'); }} disabled={capturing} className="btn btn-secondary text-sm">Back</button>
                <button type="button" onClick={captureSequence} disabled={capturing} className="btn btn-primary text-sm">
                  {capturing ? <><Loader2 size={14} className="animate-spin" /> Taking photos…</> : <><Camera size={14} /> Take photos</>}
                </button>
              </div>
            </>
          )}

          {stage === 'checking' && (
            <div className="flex flex-col items-center py-8 gap-3" aria-live="polite">
              <Loader2 size={26} className="animate-spin" style={{ color: 'var(--forest)' }} />
              <p className="text-sm font-medium" style={{ color: 'var(--ink-2)' }}>Checking photos…</p>
              <p className="text-xs" style={{ color: 'var(--ink-4)' }}>The first check can take a few seconds.</p>
            </div>
          )}

          {stage === 'done' && (
            <div className="flex flex-col items-center py-6 gap-3 text-center" aria-live="polite">
              <div className="flex items-center justify-center" style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(74,124,89,0.12)' }}>
                <ShieldCheck size={24} style={{ color: 'var(--success)' }} />
              </div>
              <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Face ID is set up</p>
              <p className="text-xs" style={{ color: 'var(--ink-3)' }}>The device will now recognise {employeeName} when they press Start.</p>
              <button type="button" onClick={close} className="btn btn-primary text-sm mt-2"><Check size={14} /> Done</button>
            </div>
          )}

          {stage === 'error' && (
            <div className="space-y-4" aria-live="polite">
              <p className="text-sm" role="alert" style={{ color: 'var(--error)' }}>{error}</p>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={close} className="btn btn-secondary text-sm">Cancel</button>
                <button type="button" onClick={() => setStage('intro')} className="btn btn-primary text-sm"><RotateCcw size={14} /> Try again</button>
              </div>
            </div>
          )}

          {shots.length > 0 && (stage === 'camera' || stage === 'checking') && (
            <div className="flex gap-2" aria-hidden="true">
              {shots.map((s, i) => (
                <img key={i} src={s} alt="" className="rounded-lg object-cover" style={{ width: 52, height: 52, transform: 'scaleX(-1)', border: '1px solid var(--border)' }} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
