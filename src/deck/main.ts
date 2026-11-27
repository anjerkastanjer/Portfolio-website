// "To scale": a short cinematic deck. Each beat moves a camera through a 3D scene in which
// the numbers from my work are built out of real objects, at their real counts.

import '@fontsource-variable/anybody/standard.css';
import '@fontsource-variable/instrument-sans/standard.css';
import './deck.css';

import * as THREE from 'three';
import { gsap } from 'gsap';

const BG = new THREE.Color('#09090b');
const SIGNAL = new THREE.Color('#ff6b2c');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

/* ---------- Beats ---------- */

type Vec = [number, number, number];
type Beat = {
  set: 'sheets' | 'field' | 'alarms';
  title: string;
  sub: string;
  cam: Vec;
  look: Vec;
  fog: number;
  /** Scene state this beat wants; every value eases there. */
  pile?: number;
  grid?: number;
  spans?: number;
  mask?: number;
  place?: 'top' | 'bottom';
};

const beats: Beat[] = [
  {
    set: 'sheets',
    title: 'What I built, to scale.',
    sub: 'Three numbers from my work at Adami AI, built in 3D. Press → or click to continue.',
    cam: [3.4, 2.7, 5.6],
    look: [0.9, 0.1, 0],
    fog: 0.05,
  },
  {
    set: 'sheets',
    title: 'One handwritten timesheet.',
    sub: 'Someone on the production floor at Koninklijke Vezet filled this in with a pen.',
    cam: [0.6, 4.6, 2.4],
    look: [0, 0, 0],
    fog: 0.05,
  },
  {
    set: 'sheets',
    title: 'About 160 of them. Every day.',
    sub: 'Each sheet in this pile is one.',
    cam: [9, 7, 14],
    look: [0, 1.2, 0],
    fog: 0.03,
    pile: 1,
  },
  {
    set: 'sheets',
    title: 'Typing them over took two to three full-time jobs.',
    sub: 'That is the estimate for getting every sheet into the ERP by hand.',
    cam: [-12, 5, 9],
    look: [0, 1.4, 0],
    fog: 0.03,
    pile: 1,
  },
  {
    set: 'sheets',
    title: 'Now two AI models read them and check each other.',
    sub: '97% of the numbers go straight through. The other 3% go to a person. Under $0.10 a form.',
    cam: [0, 34, 30],
    look: [0, 0, 1.5],
    fog: 0.01,
    pile: 1,
    grid: 1,
  },
  {
    set: 'field',
    title: '72,000 documents.',
    sub: 'Every slab is one. This is the set my personal-data detector was measured on.',
    cam: [0, 9, 215],
    look: [0, 0, 60],
    fog: 0.0055,
  },
  {
    set: 'field',
    title: '350,000 pieces of personal data inside them.',
    sub: 'Names, addresses, IDs. Every orange dot is one.',
    cam: [40, 46, 190],
    look: [0, 0, 20],
    fog: 0.0035,
    spans: 1,
  },
  {
    set: 'field',
    title: 'Masked before any outside AI sees them.',
    sub: 'F1 0.998, from three layers: rules, a BERT model and an LLM reviewer.',
    cam: [-60, 120, 230],
    look: [0, 0, 0],
    fog: 0.0022,
    spans: 1,
    mask: 1,
  },
  {
    set: 'alarms',
    title: 'The reviewer removed 11,869 false alarms.',
    sub: 'It cost 17 real ones. That is the small orange row in front.',
    cam: [40, 30, 82],
    look: [8, 0, 18],
    fog: 0.006,
    place: 'top',
  },
  {
    set: 'alarms',
    title: 'Want the rest?',
    sub: '',
    cam: [10, 9, 58],
    look: [20, 1, 40],
    fog: 0.012,
  },
];

/* ---------- Renderer and world ---------- */

const canvas = $<HTMLCanvasElement>('#stage');
let renderer: THREE.WebGLRenderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch {
  document.documentElement.classList.add('no-webgl');
  throw new Error('WebGL unavailable');
}
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = BG;
const fog = new THREE.FogExp2(BG, 0.05);
scene.fog = fog;
const camera = new THREE.PerspectiveCamera(36, 1, 0.5, 1500);

scene.add(new THREE.HemisphereLight('#cfd4ff', '#1a1612', 0.35));

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(3000, 3000),
  new THREE.MeshStandardMaterial({ color: '#131316', roughness: 0.92, metalness: 0 }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const rand = (() => {
  let s = 12345;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
})();
const gauss = () => (rand() + rand() + rand() - 1.5) / 1.5;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/* ---------- Set 1: the timesheets ---------- */

function sheetTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 724;
  const g = c.getContext('2d')!;
  g.fillStyle = '#efe9db';
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = '#8d8779';
  g.lineWidth = 2;
  const cols = [36, 220, 330, 410, 476];
  for (let r = 0; r <= 12; r++) {
    const y = 90 + r * 48;
    g.beginPath();
    g.moveTo(36, y);
    g.lineTo(476, y);
    g.stroke();
  }
  for (const x of cols) {
    g.beginPath();
    g.moveTo(x, 90);
    g.lineTo(x, 666);
    g.stroke();
  }
  g.fillStyle = '#5b5648';
  g.fillRect(36, 40, 190, 14);
  g.fillRect(36, 62, 110, 8);
  g.strokeStyle = '#1b2a7a';
  g.lineWidth = 3;
  g.lineCap = 'round';
  for (let r = 0; r < 12; r++) {
    for (let k = 0; k < 4; k++) {
      const x0 = cols[k] + 12;
      const len = (cols[k + 1] - cols[k] - 24) * (0.45 + rand() * 0.5);
      const cy = 90 + r * 48 + 27;
      const f = 0.16 + rand() * 0.12;
      g.beginPath();
      for (let x = 0; x <= len; x += 3) {
        const y = cy + Math.sin(x * f + r) * 8 * (0.5 + 0.5 * Math.sin(x * 0.07 + k));
        if (x === 0) g.moveTo(x0, y);
        else g.lineTo(x0 + x, y);
      }
      g.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

const SHEETS = 160;
const sheetW = 2.1;
const sheetD = 2.97;
const sheetSet = new THREE.Group();
scene.add(sheetSet);

const sheetSide = new THREE.MeshStandardMaterial({ color: '#d8d2c4', roughness: 0.9 });
const sheetTop = new THREE.MeshStandardMaterial({ map: sheetTexture(), roughness: 0.85 });
const sheets = new THREE.InstancedMesh(
  new THREE.BoxGeometry(sheetW, 0.014, sheetD),
  [sheetSide, sheetSide, sheetTop, sheetSide, sheetSide, sheetSide],
  SHEETS,
);
sheets.castShadow = true;
sheets.receiveShadow = true;
sheets.frustumCulled = false;
sheetSet.add(sheets);

const lamp = new THREE.SpotLight('#ffdfb5', 9000, 200, 0.62, 0.7, 2);
lamp.position.set(7, 24, 9);
lamp.castShadow = true;
lamp.shadow.mapSize.set(2048, 2048);
lamp.shadow.bias = -0.0004;
lamp.shadow.radius = 4;
sheetSet.add(lamp, lamp.target);

// Where every sheet lies in the pile, and where it ends up in the sorted grid.
const pilePos: THREE.Vector3[] = [];
const pileQuat: THREE.Quaternion[] = [];
const gridPos: THREE.Vector3[] = [];
const flat = new THREE.Quaternion();
const flagged = new Set([23, 61, 88, 117, 142]); // 5 of 160 is 3%
for (let i = 0; i < SHEETS; i++) {
  if (i === 0) {
    pilePos.push(new THREE.Vector3(0, 0.04, 0));
    pileQuat.push(new THREE.Quaternion());
  } else {
    const spread = 3.2;
    const x = gauss() * spread;
    const z = gauss() * spread;
    const height = 0.06 + i * 0.016 * Math.exp(-(x * x + z * z) / 14);
    pilePos.push(new THREE.Vector3(x, height, z));
    pileQuat.push(
      new THREE.Quaternion().setFromEuler(new THREE.Euler(gauss() * 0.07, rand() * Math.PI * 2, gauss() * 0.07)),
    );
  }
  const col = i % 16;
  const row = Math.floor(i / 16);
  gridPos.push(new THREE.Vector3((col - 7.5) * 2.5, 0.06, (row - 4.5) * 3.4));
}

const state = { pile: 0, grid: 0, spans: 0, mask: 0, fog: 0.05, px: 3.4, py: 2.7, pz: 5.6, tx: 0.9, ty: 0.1, tz: 0 };
const dummy = new THREE.Object3D();
const tmpColor = new THREE.Color();
const spin = new THREE.Quaternion();

function updateSheets() {
  for (let i = 0; i < SHEETS; i++) {
    // Each sheet runs the same motion a little later than the one before it.
    const fall = i === 0 ? 1 : easeOut(clamp01(state.pile * 1.9 - (i / SHEETS) * 0.9));
    const sort = easeInOut(clamp01(state.grid * 1.8 - (i / SHEETS) * 0.8));
    const p = pilePos[i];
    const g = gridPos[i];
    const lift = flagged.has(i) ? 1.6 : 0;

    dummy.position.set(
      p.x + (g.x - p.x) * sort,
      p.y + (1 - fall) * (26 + i * 0.25) + (g.y + lift - p.y) * sort + Math.sin(sort * Math.PI) * 5,
      p.z + (g.z - p.z) * sort,
    );
    spin.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, (1 - fall) * 5 + i);
    dummy.quaternion.copy(pileQuat[i]).multiply(spin.slerp(flat, fall)).slerp(flat, sort);
    dummy.scale.setScalar(fall > 0 ? 1 : 0);
    dummy.updateMatrix();
    sheets.setMatrixAt(i, dummy.matrix);
    tmpColor.set('#ffffff');
    if (flagged.has(i)) tmpColor.lerp(SIGNAL, sort);
    sheets.setColorAt(i, tmpColor);
  }
  // The lamp opens up as the sheets spread out into the grid.
  lamp.angle = 0.62 + 0.4 * state.grid;
  lamp.intensity = 9000 * (1 + 2.2 * state.grid);
  lamp.position.y = 24 + 16 * state.grid;
  sheets.instanceMatrix.needsUpdate = true;
  sheets.instanceColor!.needsUpdate = true;
}

/* ---------- Set 2: 72,000 documents and 350,000 pieces of personal data ---------- */

const fieldSet = new THREE.Group();
scene.add(fieldSet);
const DOC_COLS = 300;
const DOC_ROWS = 240; // 300 x 240 = 72,000
const DOC_STEP = 1.6;
const fieldW = DOC_COLS * DOC_STEP;
const fieldD = DOC_ROWS * DOC_STEP;

const docs = new THREE.InstancedMesh(
  new THREE.BoxGeometry(1.05, 1, 1.35),
  new THREE.MeshStandardMaterial({ color: '#8f8a80', roughness: 0.8 }),
  DOC_COLS * DOC_ROWS,
);
docs.frustumCulled = false;
for (let r = 0, i = 0; r < DOC_ROWS; r++) {
  for (let c = 0; c < DOC_COLS; c++, i++) {
    const h = 0.12 + rand() * rand() * 1.1;
    dummy.position.set((c - DOC_COLS / 2 + 0.5) * DOC_STEP, h / 2, (r - DOC_ROWS / 2 + 0.5) * DOC_STEP);
    dummy.quaternion.identity();
    dummy.scale.set(1, h, 1);
    dummy.updateMatrix();
    docs.setMatrixAt(i, dummy.matrix);
  }
}
fieldSet.add(docs);

const sun = new THREE.DirectionalLight('#ffe6c4', 2.4);
sun.position.set(-120, 60, 80);
fieldSet.add(sun);

const SPANS = 350_000;
const spanPos = new Float32Array(SPANS * 3);
const spanSeed = new Float32Array(SPANS);
for (let i = 0; i < SPANS; i++) {
  spanPos[i * 3] = (rand() - 0.5) * fieldW;
  spanPos[i * 3 + 1] = 1.5 + rand() * 0.6;
  spanPos[i * 3 + 2] = (rand() - 0.5) * fieldD;
  spanSeed[i] = rand();
}
const spanGeo = new THREE.BufferGeometry();
spanGeo.setAttribute('position', new THREE.BufferAttribute(spanPos, 3));
spanGeo.setAttribute('aSeed', new THREE.BufferAttribute(spanSeed, 1));
const spanMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  uniforms: {
    uShow: { value: 0 },
    uMask: { value: 0 },
    uTime: { value: 0 },
    uReach: { value: Math.hypot(fieldW, fieldD) / 2 },
    uScale: { value: 1 },
    uHot: { value: SIGNAL },
    uCalm: { value: new THREE.Color('#6f7078') },
    uFog: { value: fog.density },
  },
  vertexShader: /* glsl */ `
    attribute float aSeed;
    uniform float uShow, uMask, uTime, uReach, uScale;
    varying float vShow, vMask, vDist, vSeed;
    void main() {
      // Both waves start in the middle of the field and roll outwards.
      float d = length(position.xz) / uReach;
      vShow = smoothstep(0.0, 0.08, uShow * 1.1 - d);
      vMask = smoothstep(0.0, 0.05, uMask * 1.1 - d);
      vSeed = aSeed;
      vec3 p = position;
      p.y += sin(uTime * (0.6 + aSeed) + aSeed * 40.0) * 0.25 + (1.0 - vShow) * -1.5;
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      vDist = -mv.z;
      gl_Position = projectionMatrix * mv;
      gl_PointSize = uScale * (0.9 + aSeed * 0.9) * mix(1.0, 0.7, vMask) / max(vDist, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 uHot, uCalm;
    uniform float uFog;
    varying float vShow, vMask, vDist, vSeed;
    void main() {
      float d = length(gl_PointCoord - 0.5);
      float disc = smoothstep(0.5, 0.2, d);
      float fogF = exp(-uFog * uFog * vDist * vDist);
      vec3 color = mix(uHot, uCalm, vMask);
      gl_FragColor = vec4(color, disc * vShow * fogF * mix(0.8, 0.5, vMask));
      #include <colorspace_fragment>
    }
  `,
});
const spans = new THREE.Points(spanGeo, spanMat);
spans.frustumCulled = false;
fieldSet.add(spans);

/* ---------- Set 3: 11,869 false alarms next to 17 real ones ---------- */

const alarmSet = new THREE.Group();
scene.add(alarmSet);
const FALSE_ALARMS = 11_869;
const LOST = 17;
const cube = new THREE.BoxGeometry(0.42, 0.42, 0.42);
const side = Math.ceil(Math.sqrt(FALSE_ALARMS)); // 109
const alarms = new THREE.InstancedMesh(cube, new THREE.MeshStandardMaterial({ color: '#a8a39a', roughness: 0.7 }), FALSE_ALARMS);
alarms.frustumCulled = false;
for (let i = 0; i < FALSE_ALARMS; i++) {
  dummy.position.set(((i % side) - side / 2) * 0.62, 0.21, (Math.floor(i / side) - side / 2) * 0.62);
  dummy.quaternion.identity();
  dummy.scale.setScalar(1);
  dummy.updateMatrix();
  alarms.setMatrixAt(i, dummy.matrix);
}
const lost = new THREE.InstancedMesh(
  cube,
  new THREE.MeshStandardMaterial({ color: SIGNAL, emissive: SIGNAL, emissiveIntensity: 0.9, roughness: 0.5 }),
  LOST,
);
lost.castShadow = true;
for (let i = 0; i < LOST; i++) {
  dummy.position.set(14 + i * 0.62, 0.21, 40);
  dummy.updateMatrix();
  lost.setMatrixAt(i, dummy.matrix);
}
const alarmLight = new THREE.DirectionalLight('#ffe6c4', 2.6);
alarmLight.position.set(-40, 50, 30);
const lostGlow = new THREE.PointLight(SIGNAL, 60, 30, 2);
lostGlow.position.set(19, 2.5, 41);
alarmSet.add(alarms, lost, alarmLight, lostGlow);

const sets = { sheets: sheetSet, field: fieldSet, alarms: alarmSet };

/* ---------- Interface ---------- */

const titleEl = $('[data-title]');
const subEl = $('[data-sub]');
const textEl = $('[data-text]');
const outroEl = $('[data-outro]');
const countEl = $('[data-count]');
const veil = $('[data-veil]');
const dots = $('[data-dots]');
beats.forEach(() => dots.append(document.createElement('i')));

let current = -1;
let busy = false;
const speed = reducedMotion ? 0 : 1;

function showSet(name: Beat['set']) {
  for (const [key, group] of Object.entries(sets)) group.visible = key === name;
  floor.visible = true;
}

function applyText(beat: Beat, index: number) {
  titleEl.textContent = beat.title;
  subEl.textContent = beat.sub;
  subEl.hidden = !beat.sub;
  textEl.dataset.place = beat.place ?? 'bottom';
  outroEl.hidden = index !== beats.length - 1;
  countEl.textContent = `${index + 1} / ${beats.length}`;
  [...dots.children].forEach((d, i) => d.classList.toggle('is-on', i <= index));
  $<HTMLButtonElement>('[data-prev]').disabled = index === 0;
  $<HTMLButtonElement>('[data-next]').disabled = index === beats.length - 1;
}

function go(index: number, instant = false) {
  index = Math.max(0, Math.min(beats.length - 1, index));
  if (index === current || busy) return;
  const beat = beats[index];
  const from = current >= 0 ? beats[current] : null;
  const cut = !from || from.set !== beat.set;
  const k = instant ? 0 : speed;
  current = index;
  history.replaceState(null, '', `#${index + 1}`);

  const target = {
    pile: beat.pile ?? 0,
    grid: beat.grid ?? 0,
    spans: beat.spans ?? 0,
    mask: beat.mask ?? 0,
    fog: beat.fog,
    px: beat.cam[0],
    py: beat.cam[1],
    pz: beat.cam[2],
    tx: beat.look[0],
    ty: beat.look[1],
    tz: beat.look[2],
  };

  const tl = gsap.timeline();
  tl.to(textEl, { opacity: 0, y: -10, duration: 0.3 * k, ease: 'power2.in' });

  if (cut) {
    // A different scene: fade to black, swap everything, fade back in on a slow push.
    busy = true;
    tl.to(veil, { opacity: 1, duration: 0.45 * k }, 0);
    tl.add(() => {
      showSet(beat.set);
      gsap.killTweensOf(state);
      Object.assign(state, target, { pz: target.pz + 6, py: target.py + 1.5 });
      applyText(beat, index);
    });
    tl.to(veil, { opacity: 0, duration: 0.9 * k });
    tl.to(state, { ...target, duration: 2.6 * k, ease: 'power2.out' }, '<');
    tl.add(() => void (busy = false), '<0.3');
  } else {
    tl.add(() => applyText(beat, index));
    gsap.to(state, { ...target, duration: 2.4 * k, ease: 'power3.inOut', overwrite: true });
  }
  tl.fromTo(textEl, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.9 * k, ease: 'expo.out' }, cut ? '<0.2' : '>0.25');
}

const next = () => go(current + 1);
const prev = () => go(current - 1);

$('[data-next]').addEventListener('click', next);
$('[data-prev]').addEventListener('click', prev);
window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) {
    if ((e.target as Element).closest('a, button') && (e.key === ' ' || e.key === 'Enter')) return;
    e.preventDefault();
    next();
  } else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) {
    e.preventDefault();
    prev();
  } else if (e.key === 'Home') go(0);
});

// Click or tap the scene to continue; swipe to go either way.
let downX = 0;
canvas.addEventListener('pointerdown', (e) => (downX = e.clientX));
canvas.addEventListener('pointerup', (e) => {
  const dx = e.clientX - downX;
  if (dx > 50) prev();
  else next();
});

/* ---------- Loop ---------- */

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // Portrait screens get a wider lens so the scene still fits.
  camera.fov = w < h ? 58 : 36;
  // On wide screens the subject sits right of centre, leaving the left for the words.
  if (w > h * 1.2) camera.setViewOffset(w, h, -w * 0.13, h * 0.05, w, h);
  else camera.setViewOffset(w, h, 0, h * 0.14, w, h);
  camera.updateProjectionMatrix();
  spanMat.uniforms.uScale.value = h * renderer.getPixelRatio() * 0.32;
}
window.addEventListener('resize', resize);
resize();

const lookAt = new THREE.Vector3();
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const t = clock.getElapsedTime();
  const sway = reducedMotion ? 0 : 1;
  const reach = Math.hypot(state.px, state.py, state.pz) * 0.012 * sway;
  camera.position.set(state.px + Math.sin(t * 0.23) * reach, state.py + Math.sin(t * 0.31) * reach * 0.5, state.pz + Math.cos(t * 0.19) * reach);
  camera.lookAt(lookAt.set(state.tx, state.ty, state.tz));
  fog.density = state.fog;

  if (sheetSet.visible) updateSheets();
  if (fieldSet.visible) {
    spanMat.uniforms.uShow.value = state.spans;
    spanMat.uniforms.uMask.value = state.mask;
    spanMat.uniforms.uTime.value = t;
    spanMat.uniforms.uFog.value = state.fog;
  }
  renderer.render(scene, camera);
});

document.fonts.ready.then(() => {
  const start = Number.parseInt(location.hash.slice(1), 10);
  go(Number.isFinite(start) ? start - 1 : 0, true);
  document.documentElement.classList.add('is-ready');
});
if (import.meta.env.DEV) Object.assign(window, { deck: { go, state, beats } });
