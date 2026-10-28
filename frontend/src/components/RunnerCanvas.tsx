import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/**
 * Side-profile 3D runner with a procedural skeleton (forward kinematics).
 * Runs in place over a scrolling ground line. Colours come from the dashboard's
 * CSS variables so it follows the active theme. Pauses when off-screen / hidden,
 * and renders a single static pose under prefers-reduced-motion.
 */

const L = { thigh: 0.46, shank: 0.46, foot: 0.2, torso: 0.58, upperArm: 0.3, foreArm: 0.28, head: 0.12 };
const R = { thigh: 0.075, shank: 0.06, upperArm: 0.052, foreArm: 0.045, torso: 0.11 };
const CYCLE_HZ = 2.7; // full strides (L+R) per second — brisk run
const GROUND_SPEED = 3.6; // world units / second, matches foot speed roughly

function cssColor(name: string, fallback: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function limb(len: number, r: number, mat: THREE.Material) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(len - r * 2, 0.01), 6, 14), mat);
  m.position.y = -len / 2;
  g.add(m);
  return g;
}

interface Leg { hip: THREE.Group; knee: THREE.Group; ankle: THREE.Group; foot: THREE.Object3D }
interface Arm { shoulder: THREE.Group; elbow: THREE.Group }

function buildRunner(near: THREE.Material, far: THREE.Material, skin: THREE.Material) {
  const root = new THREE.Group();
  const pelvis = new THREE.Group();
  root.add(pelvis);

  const makeLeg = (mat: THREE.Material, z: number): Leg => {
    const hip = limb(L.thigh, R.thigh, mat);
    hip.position.set(0, 0, z);
    const knee = limb(L.shank, R.shank, mat);
    knee.position.y = -L.thigh;
    const ankle = new THREE.Group();
    ankle.position.y = -L.shank;
    const foot = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, L.foot - 0.08, 4, 10), mat);
    foot.rotation.z = Math.PI / 2;
    foot.position.set(0.06, -0.03, 0);
    ankle.add(foot);
    knee.add(ankle);
    hip.add(knee);
    pelvis.add(hip);
    return { hip, knee, ankle, foot };
  };

  const hipZ = 0.05;
  const legs = [makeLeg(near, hipZ), makeLeg(far, -hipZ)];

  // Torso pivots at the pelvis so it can lean forward.
  const torso = new THREE.Group();
  pelvis.add(torso);
  const torsoMesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(R.torso, L.torso - R.torso * 2, 8, 16),
    near,
  );
  torsoMesh.position.y = L.torso / 2;
  torsoMesh.scale.z = 0.8;
  torso.add(torsoMesh);

  const neck = new THREE.Group();
  neck.position.y = L.torso + 0.02;
  torso.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(L.head, 20, 16), skin);
  head.position.set(0.02, L.head * 0.9, 0);
  head.scale.set(1.05, 1.15, 0.95);
  neck.add(head);

  const makeArm = (mat: THREE.Material, z: number): Arm => {
    const shoulder = limb(L.upperArm, R.upperArm, mat);
    shoulder.position.set(0, L.torso - 0.06, z);
    const elbow = limb(L.foreArm, R.foreArm, mat);
    elbow.position.y = -L.upperArm;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), skin);
    hand.position.y = -L.foreArm;
    elbow.add(hand);
    shoulder.add(elbow);
    torso.add(shoulder);
    return { shoulder, elbow };
  };
  const arms = [makeArm(near, 0.16), makeArm(far, -0.16)];

  return { root, pelvis, torso, neck, legs, arms };
}

type Runner = ReturnType<typeof buildRunner>;

function pose(r: Runner, phase: number) {
  const legPhase = [phase, phase + Math.PI];
  r.legs.forEach((leg, i) => {
    const p = legPhase[i];
    leg.hip.rotation.z = 0.12 + 0.82 * Math.sin(p);
    leg.knee.rotation.z = -(0.78 - 0.68 * Math.sin(p - 1.5));
    leg.ankle.rotation.z = 0.25 - 0.35 * Math.sin(p + 0.6);
  });
  r.arms.forEach((arm, i) => {
    const p = legPhase[1 - i]; // opposite leg
    arm.shoulder.rotation.z = 0.9 * Math.sin(p) - 0.05;
    arm.elbow.rotation.z = 1.55 + 0.25 * Math.sin(p + 0.9);
  });
  // forward lean + small counter-rotation, head stays level
  const lean = -0.2 + 0.03 * Math.sin(phase * 2);
  r.torso.rotation.z = lean;
  r.torso.rotation.x = 0.06 * Math.sin(phase);
  r.neck.rotation.z = -lean * 0.8;

  // Ground-lock: lift/lower the body so the lowest foot rests on the floor.
  r.root.position.y = 0;
  r.root.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  let lowest = Infinity;
  r.legs.forEach(l => { l.foot.getWorldPosition(v); lowest = Math.min(lowest, v.y); });
  r.root.position.y = 0.04 - lowest;
}

export default function RunnerCanvas({ className = '', height = 128 }: { className?: string; height?: number }) {
  const hostRef = useRef<HTMLDivElement>(null);

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
    const frameMs = small ? 1000 / 30 : 1000 / 60;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.cssText = 'display:block;width:100%;height:100%';
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 20);
    camera.position.set(0, 0.95, 6);
    camera.lookAt(0, 0.95, 0);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a7a, 1.5));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(-2, 4, 5);
    scene.add(key);

    const near = new THREE.MeshStandardMaterial({ color: cssColor('--forest', '#425443'), roughness: 0.6 });
    const far = new THREE.MeshStandardMaterial({ color: cssColor('--forest-light', '#637B64'), roughness: 0.65 });
    const skin = new THREE.MeshStandardMaterial({ color: cssColor('--terra', '#C47F61'), roughness: 0.7 });
    const runner = buildRunner(near, far, skin);
    scene.add(runner.root);

    // Ground line with scrolling ticks (the world moves, the runner stays put).
    const lineMat = new THREE.MeshBasicMaterial({ color: cssColor('--border-strong', '#C9C6BC') });
    const tickMat = new THREE.MeshBasicMaterial({ color: cssColor('--ink-4', '#9E9E94') });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 0.025), lineMat);
    ground.position.set(0, -0.02, -0.5);
    scene.add(ground);
    const TICK_GAP = 0.9, TICKS = 24;
    const ticks: THREE.Mesh[] = [];
    const tickGeo = new THREE.PlaneGeometry(0.28, 0.02);
    for (let i = 0; i < TICKS; i++) {
      const t = new THREE.Mesh(tickGeo, tickMat);
      t.position.set(i * TICK_GAP, -0.14, -0.5);
      scene.add(t); ticks.push(t);
    }
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x292b25, transparent: true, opacity: 0.12 });
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.34, 32), shadowMat);
    shadow.scale.y = 0.14;
    shadow.position.set(0, -0.015, -0.4);
    scene.add(shadow);

    let viewW = 4;
    const resize = () => {
      const w = Math.max(host.clientWidth, 1), h = Math.max(host.clientHeight, 1);
      renderer.setSize(w, h, false);
      // Fit the figure (~1.9 tall) with headroom; widen for wide cards.
      const viewH = 2.05;
      viewW = viewH * (w / h);
      camera.left = -viewW / 2; camera.right = viewW / 2;
      camera.top = viewH; camera.bottom = -0.2;
      camera.position.set(0, 0, 6);
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    let phase = 0, scroll = 0, last = 0, raf = 0, acc = 0;
    let visible = true, tabVisible = !document.hidden;

    const draw = () => {
      pose(runner, phase);
      const span = TICKS * TICK_GAP;
      ticks.forEach((t, i) => {
        const x = ((i * TICK_GAP - scroll) % span + span) % span - span / 2;
        t.position.x = x;
      });
      renderer.render(scene, camera);
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!last) last = now;
      acc += now - last;
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      if (acc < frameMs - 1) return;
      acc = 0;
      phase += dt * CYCLE_HZ * Math.PI * 2 / 2; // phase spans half a stride pair per leg swap
      scroll += dt * GROUND_SPEED;
      draw();
    };
    const start = () => { if (!raf && visible && tabVisible && !reduced) { last = 0; raf = requestAnimationFrame(loop); } };
    const stop = () => { cancelAnimationFrame(raf); raf = 0; };

    phase = 0.6; draw(); // static mid-stride pose (also the reduced-motion result)

    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible ? start() : stop(); });
    io.observe(host);
    const onVis = () => { tabVisible = !document.hidden; tabVisible ? start() : stop(); };
    document.addEventListener('visibilitychange', onVis);
    start();

    return () => {
      stop(); io.disconnect(); ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      scene.traverse(o => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
      });
      [near, far, skin, lineMat, tickMat, shadowMat].forEach(m => m.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div
      ref={hostRef}
      className={className}
      style={{ height, width: '100%' }}
      role="img"
      aria-label="Animated runner"
    />
  );
}
