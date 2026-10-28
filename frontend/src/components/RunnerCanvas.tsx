import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/**
 * Side-profile 3D runner with a procedural skeleton (forward kinematics).
 * Modes: `ready` (one-knee-down start stance, breathing), `run` (uphill
 * climbing gait), `down` (shorter, upright downhill gait) and `summit`
 * (arms-up victory hops). Joint angles ease between poses, and the feet are
 * ground-locked every frame. Colours come from the dashboard's CSS variables.
 * Pauses when off-screen / hidden, and snaps to a static pose under
 * prefers-reduced-motion.
 */

export type RunnerMode = 'ready' | 'run' | 'down' | 'summit';

const L = { thigh: 0.46, shank: 0.46, foot: 0.2, torso: 0.58, upperArm: 0.3, foreArm: 0.28, head: 0.12 };
const R = { thigh: 0.075, shank: 0.06, upperArm: 0.052, foreArm: 0.045, torso: 0.11 };

function cssColor(name: string, fallback: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

interface Leg { hip: THREE.Group; knee: THREE.Group; ankle: THREE.Group; foot: THREE.Object3D }
interface Arm { shoulder: THREE.Group; elbow: THREE.Group }

interface Outfit {
  shirt: THREE.Material; shirtFar: THREE.Material;
  shorts: THREE.Material; shortsFar: THREE.Material;
  skin: THREE.Material; skinFar: THREE.Material;
  shoe: THREE.Material; hair: THREE.Material;
}

/** Capsule limb whose upper part is `top` (e.g. shorts) and lower part is `bottom` (e.g. skin). */
function segment(len: number, r: number, mat: THREE.Material) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(len - r * 2, 0.01), 6, 14), mat);
  m.position.y = -len / 2;
  const g = new THREE.Group();
  g.add(m);
  return g;
}

function buildRunner(o: Outfit) {
  const root = new THREE.Group();
  const pelvis = new THREE.Group();
  root.add(pelvis);

  const makeLeg = (shorts: THREE.Material, skin: THREE.Material, z: number): Leg => {
    const hip = segment(L.thigh, R.thigh, shorts);
    hip.position.set(0, 0, z);
    const knee = segment(L.shank, R.shank, skin);
    knee.position.y = -L.thigh;
    const ankle = new THREE.Group();
    ankle.position.y = -L.shank;
    const foot = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, L.foot - 0.1, 4, 10), o.shoe);
    foot.rotation.z = Math.PI / 2;
    foot.position.set(0.06, -0.03, 0);
    ankle.add(foot);
    knee.add(ankle);
    hip.add(knee);
    pelvis.add(hip);
    return { hip, knee, ankle, foot };
  };

  const hipZ = 0.05;
  const legs = [makeLeg(o.shorts, o.skin, hipZ), makeLeg(o.shortsFar, o.skinFar, -hipZ)];

  // Torso pivots at the pelvis so it can lean forward.
  const torso = new THREE.Group();
  pelvis.add(torso);
  const torsoMesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(R.torso, L.torso - R.torso * 2, 8, 16),
    o.shirt,
  );
  torsoMesh.position.y = L.torso / 2;
  torsoMesh.scale.z = 0.8;
  torso.add(torsoMesh);
  // shorts waistband overlaps the bottom of the shirt
  const waist = new THREE.Mesh(new THREE.CapsuleGeometry(R.torso * 0.98, 0.04, 6, 14), o.shorts);
  waist.position.y = 0.04;
  waist.scale.z = 0.8;
  torso.add(waist);

  const neck = new THREE.Group();
  neck.position.y = L.torso + 0.02;
  torso.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(L.head, 20, 16), o.skin);
  head.position.set(0.02, L.head * 0.9, 0);
  head.scale.set(1.05, 1.15, 0.95);
  neck.add(head);
  // hair: a cap sitting on the back/top of the head
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(L.head * 1.06, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.55),
    o.hair,
  );
  hair.position.copy(head.position);
  hair.scale.copy(head.scale);
  hair.rotation.z = 0.35; // tilt back so the face stays clear
  neck.add(hair);

  const makeArm = (shirt: THREE.Material, skin: THREE.Material, z: number): Arm => {
    const shoulder = segment(L.upperArm, R.upperArm * 1.1, shirt);
    shoulder.position.set(0, L.torso - 0.06, z);
    const elbow = segment(L.foreArm, R.foreArm, skin);
    elbow.position.y = -L.upperArm;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), skin);
    hand.position.y = -L.foreArm;
    elbow.add(hand);
    shoulder.add(elbow);
    torso.add(shoulder);
    return { shoulder, elbow };
  };
  const arms = [makeArm(o.shirt, o.skin, 0.16), makeArm(o.shirtFar, o.skinFar, -0.16)];

  return { root, pelvis, torso, neck, legs, arms };
}

type Runner = ReturnType<typeof buildRunner>;

const FRONT_HIP = 1.5, BACK_HIP = -0.5, LEAN = -1.15;

/** Crouched start: back knee on the track, front foot planted, hands down. */
function setStance(r: Runner) {
  const [front, back] = r.legs;
  const v = new THREE.Vector3();
  const worldY = (o: THREE.Object3D) => { r.root.updateMatrixWorld(true); return o.getWorldPosition(v).y; };

  r.torso.rotation.z = LEAN;
  r.neck.rotation.z = 0.7; // head up, eyes on the track ahead
  r.arms.forEach(arm => {
    arm.shoulder.rotation.z = -LEAN + 0.05; // straight down to the track
    arm.elbow.rotation.z = 0.05;
  });

  // Back shin lies flat on the track; its knee sets the body height.
  back.hip.rotation.z = BACK_HIP;
  back.knee.rotation.z = -1.57 - BACK_HIP;
  back.ankle.rotation.z = 1.2; // toes tucked under
  r.root.position.y = 0;
  r.root.position.y = R.shank - worldY(back.knee);

  // Front thigh near-horizontal; bend the shin until the foot meets the track.
  front.hip.rotation.z = FRONT_HIP;
  let lo = 0, hi = 1.4; // shin lean (foot behind knee)
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    front.knee.rotation.z = -mid - FRONT_HIP;
    front.ankle.rotation.z = mid;
    worldY(front.foot) - 0.04 > 0 ? (lo = mid) : (hi = mid);
  }
}

/** Every animated joint angle (radians). N = near side, F = far side. */
interface Pose {
  torso: number; neck: number;
  shN: number; elN: number; shF: number; elF: number;
  hipN: number; kneeN: number; ankN: number;
  hipF: number; kneeF: number; ankF: number;
  hop: number; // lift above the ground (airborne)
}

function readStance(r: Runner): Pose {
  setStance(r);
  const [n, f] = r.legs, [an, af] = r.arms;
  return {
    torso: r.torso.rotation.z, neck: r.neck.rotation.z,
    shN: an.shoulder.rotation.z, elN: an.elbow.rotation.z, shF: af.shoulder.rotation.z, elF: af.elbow.rotation.z,
    hipN: n.hip.rotation.z, kneeN: n.knee.rotation.z, ankN: n.ankle.rotation.z,
    hipF: f.hip.rotation.z, kneeF: f.knee.rotation.z, ankF: f.ankle.rotation.z,
    hop: 0,
  };
}

interface Gait { lean: number; stride: number; lift: number; arm: number; elbow: number; bias: number; hop: number; omega: number }
const GAITS: Record<'run' | 'down', Gait> = {
  // leaning into the hill, high knees, driving arms
  run:  { lean: 0.5,  stride: 0.72, lift: 1.3, arm: 0.95, elbow: 1.25, bias: 0.12, hop: 0.03,  omega: 12 },
  // upright, short quick steps, arms out for balance
  down: { lean: 0.06, stride: 0.55, lift: 0.9, arm: 0.7,  elbow: 0.75, bias: 0,    hop: 0.035, omega: 11 },
};

function gaitPose(p: number, g: Gait): Pose {
  const leg = (q: number) => {
    const hip = g.stride * Math.sin(q) + g.bias;
    const k = 0.5 + 0.5 * Math.cos(q - 0.3); // knee folds while the leg swings through
    const knee = -(0.15 + g.lift * k * k);
    return { hip, knee, ank: -(hip + knee) * (0.7 - 0.3 * Math.cos(q)) }; // foot flat in stance
  };
  const a = leg(p), b = leg(p + Math.PI);
  const sN = Math.sin(p + Math.PI), sF = Math.sin(p); // each arm swings against its same-side leg
  return {
    torso: -g.lean + 0.03 * Math.sin(2 * p), neck: g.lean * 0.7,
    shN: g.arm * sN + g.lean, elN: g.elbow + 0.35 * sN,
    shF: g.arm * sF + g.lean, elF: g.elbow + 0.35 * sF,
    hipN: a.hip, kneeN: a.knee, ankN: a.ank,
    hipF: b.hip, kneeF: b.knee, ankF: b.ank,
    hop: g.hop * Math.abs(Math.sin(p)),
  };
}

/** Standing tall on the peak, both arms up, hopping. */
function summitPose(t: number): Pose {
  const j = Math.abs(Math.sin(t * 4.5));        // 0 = crouched, 1 = airborne
  const bend = 0.1 + 0.5 * (1 - j);
  const wave = 0.14 * Math.sin(t * 9);
  const lean = 0.06;
  return {
    torso: -lean, neck: 0.15,
    shN: Math.PI - 0.65 + wave + lean, elN: 0.15, shF: Math.PI + 0.4 - wave + lean, elF: -0.15,
    hipN: bend * 0.5, kneeN: -bend, ankN: bend * 0.5,
    hipF: bend * 0.5 - 0.2, kneeF: -bend, ankF: bend * 0.5 + 0.2,
    hop: 0.09 * j,
  };
}

export default function RunnerCanvas({ className = '', width = 80, height = 64, mode = 'ready' }: { className?: string; width?: number; height?: number; mode?: RunnerMode }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const snapRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
      return; // WebGL unavailable: card keeps its empty (but sized) area
    }
    const small = window.matchMedia('(max-width: 640px)').matches;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.cssText = 'display:block;width:100%;height:100%';
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 30);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a7a, 1.5));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(-2, 4, 5);
    scene.add(key);

    const mat = (color: string, roughness = 0.7) => new THREE.MeshStandardMaterial({ color, roughness });
    const dark = (hex: string) => new THREE.Color(hex).multiplyScalar(0.78).getStyle();
    const SHIRT = cssColor('--terra', '#C47F61'), SHORTS = cssColor('--ink', '#292B25'), SKIN = '#E3B48F';
    const outfit: Outfit = {
      shirt: mat(SHIRT, 0.6), shirtFar: mat(dark(SHIRT), 0.6),
      shorts: mat(SHORTS, 0.6), shortsFar: mat(dark(SHORTS), 0.6),
      skin: mat(SKIN), skinFar: mat(dark(SKIN)),
      shoe: mat('#F7F5EF', 0.5), hair: mat('#2B2420', 0.8),
    };
    const runner = buildRunner(outfit);
    runner.root.position.x = 0.1;
    scene.add(runner.root);

    const stance = readStance(runner);
    const cur: Pose = { ...stance };
    const keys = Object.keys(stance) as (keyof Pose)[];

    let viewW = 4;
    const resize = () => {
      const w = Math.max(host.clientWidth, 1), h = Math.max(host.clientHeight, 1);
      renderer.setSize(w, h, false);
      // Fixed scale (72px canvas = 1.7 units) so taller canvases just add headroom.
      // Feet sit on the bottom edge so the canvas can stand directly on the graph line.
      const ppu = 72 / 1.7;
      const viewH = h / ppu;
      viewW = w / ppu;
      camera.left = -viewW / 2; camera.right = viewW / 2;
      camera.top = viewH / 2; camera.bottom = -viewH / 2;
      camera.position.set(0, viewH / 2 - 0.05, 6);
      camera.lookAt(0, viewH / 2 - 0.05, 0);
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    let time = 0, phase = 0, last = 0, raf = 0, acc = 0;
    let visible = true, tabVisible = !document.hidden;
    const tmp = new THREE.Vector3();

    const target = (m: RunnerMode): Pose => {
      const b = Math.sin(time * 1.6);
      if (m === 'run' || m === 'down') return gaitPose(phase, GAITS[m]);
      if (m === 'summit') return summitPose(time);
      return { ...stance, torso: LEAN + 0.025 * b, neck: 0.7 - 0.025 * b };
    };

    /** Put the lowest point of the body (shoe tips / knees) exactly on the ground. */
    const groundLock = (hop: number) => {
      runner.root.position.y = 0;
      runner.root.updateMatrixWorld(true);
      let low = Infinity;
      for (const leg of runner.legs) {
        for (const d of [-0.05, 0.05]) {
          tmp.set(0, d, 0);
          leg.foot.localToWorld(tmp);
          low = Math.min(low, tmp.y - 0.045);
        }
        tmp.set(0, 0, 0);
        leg.knee.localToWorld(tmp);
        low = Math.min(low, tmp.y - R.shank);
      }
      runner.root.position.y = -low + hop;
    };

    const apply = (c: Pose, breath: number) => {
      const [n, f] = runner.legs, [an, af] = runner.arms;
      runner.torso.rotation.z = c.torso;
      runner.neck.rotation.z = c.neck;
      an.shoulder.rotation.z = c.shN; an.elbow.rotation.z = c.elN;
      af.shoulder.rotation.z = c.shF; af.elbow.rotation.z = c.elF;
      n.hip.rotation.z = c.hipN; n.knee.rotation.z = c.kneeN; n.ankle.rotation.z = c.ankN;
      f.hip.rotation.z = c.hipF; f.knee.rotation.z = c.kneeF; f.ankle.rotation.z = c.ankF;
      runner.torso.scale.set(1, 1 + 0.012 * breath, 1);
      groundLock(c.hop);
    };

    const draw = (dt: number) => {
      const m = modeRef.current;
      time += dt;
      if (m === 'run' || m === 'down') phase += GAITS[m].omega * dt;
      const tgt = target(m);
      const k = 1 - Math.exp(-dt * 26);
      for (const key of keys) cur[key] += (tgt[key] - cur[key]) * k;
      apply(cur, m === 'ready' || m === 'summit' ? Math.sin(time * 1.6) : 0);
      renderer.render(scene, camera);
    };

    // Reduced motion: jump straight to the pose for the current mode.
    snapRef.current = reduced ? () => {
      const tgt = target(modeRef.current);
      keys.forEach(key => { cur[key] = tgt[key]; });
      apply(cur, 0);
      renderer.render(scene, camera);
    } : null;

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!last) last = now;
      acc += now - last;
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const m = modeRef.current;
      const frameMs = m === 'run' || m === 'down' || m === 'summit' ? 1000 / 50 : 1000 / 30;
      if (acc < frameMs - 1) return;
      acc = 0;
      draw(dt);
    };
    const start = () => { if (!raf && visible && tabVisible && !reduced) { last = 0; raf = requestAnimationFrame(loop); } };
    const stop = () => { cancelAnimationFrame(raf); raf = 0; };

    apply(cur, 0);
    renderer.render(scene, camera);
    snapRef.current?.();

    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible ? start() : stop(); });
    io.observe(host);
    const onVis = () => { tabVisible = !document.hidden; tabVisible ? start() : stop(); };
    document.addEventListener('visibilitychange', onVis);
    start();

    return () => {
      stop(); io.disconnect(); ro.disconnect();
      snapRef.current = null;
      document.removeEventListener('visibilitychange', onVis);
      scene.traverse(o => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
      });
      Object.values(outfit).forEach(m => (m as THREE.Material).dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  useEffect(() => { snapRef.current?.(); }, [mode]);

  const label = { ready: 'Runner crouched and ready to run', run: 'Runner climbing', down: 'Runner heading down', summit: 'Runner celebrating on the peak' }[mode];
  return (
    <div
      ref={hostRef}
      className={className}
      style={{ height, width }}
      role="img"
      aria-label={label}
    />
  );
}
