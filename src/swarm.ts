import * as THREE from 'three';
import type { Shape } from './shapes';

const BG = new THREE.Color('#09090b');
const PAPER = new THREE.Color('#f4f1ea');
const SIGNAL = new THREE.Color('#ff6b2c');

/** Share of the previous frame that is wiped each frame. The rest lingers as a motion trail. */
const FADE = 0.34;

const vertexShader = /* glsl */ `
  attribute float aSeed;
  attribute float aSpeed;
  attribute float aTint;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform vec2 uPivot;
  uniform float uYaw;
  uniform float uPitch;
  varying float vSpeed;
  varying float vSeed;
  varying float vDepth;
  varying float vTint;
  void main() {
    vSpeed = aSpeed;
    vTint = aTint;
    vSeed = aSeed;
    // Rotate around the pivot (screen space, y pointing down), then apply a simple perspective.
    vec3 p = position - vec3(uPivot, 0.0);
    float cy = cos(uYaw), sy = sin(uYaw);
    p = vec3(p.x * cy + p.z * sy, p.y, -p.x * sy + p.z * cy);
    float cx = cos(uPitch), sx = sin(uPitch);
    p = vec3(p.x, p.y * cx - p.z * sx, p.y * sx + p.z * cx);
    float persp = 1400.0 / (1400.0 - min(p.z, 1000.0));
    vDepth = clamp(p.z / 220.0, -1.0, 1.0);
    gl_Position = projectionMatrix * vec4(p.xy * persp + uPivot, 0.0, 1.0);
    gl_PointSize = uSize * uPixelRatio * (0.6 + aSeed * 0.8) * (1.0 + aSpeed * 0.7) * persp;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uPaper;
  uniform vec3 uSignal;
  uniform float uAlpha;
  uniform float uStamp;
  varying float vSpeed;
  varying float vSeed;
  varying float vDepth;
  varying float vTint;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float disc = smoothstep(0.5, 0.32, d);
    if (disc < 0.01) discard;
    // Orange when moving fast, or when the shape asks for it (the redaction bars).
    vec3 color = mix(uPaper, uSignal, max(vTint, smoothstep(0.15, 0.9, vSpeed)));
    // Each frame stamps only a fraction of the dot: a resting particle builds up to full
    // brightness, a moving one smears into a streak. Fast ones get a boost so streaks stay visible.
    float a = disc * uAlpha * (0.55 + vSeed * 0.45) * (0.7 + 0.3 * vDepth) * uStamp * (1.0 + 2.4 * vSpeed);
    gl_FragColor = vec4(color, a);
    #include <colorspace_fragment>
  }
`;

/**
 * Call back after a real change of viewport size, not on every resize event. On phones the
 * address bar sliding in and out while scrolling changes the height by roughly 50-120 px;
 * rebuilding the swarm for that wipes the trails and makes shapes jump mid-scroll.
 */
export function onViewportChange(callback: () => void, delay = 150) {
  let width = window.innerWidth;
  let height = window.innerHeight;
  let timer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      // Same width and the screen got a little shorter (the address bar came back): the
      // canvas is already tall enough, so nothing to do. If it got taller, grow once,
      // otherwise particles would be clipped in a strip at the bottom.
      if (w === width && h <= height) return;
      if (w === width && h - height < 150) {
        height = h;
        callback();
        return;
      }
      width = w;
      height = h;
      callback();
    }, delay);
  });
}

const wrapAngle = (a: number) => a - Math.round(a / (Math.PI * 2)) * Math.PI * 2;

/**
 * Thousands of particles that each steer towards their own target with a spring, get pushed
 * away by the pointer and stirred by scroll speed. A shape is just a new set of targets.
 * Everything lives in 3D: the whole swarm tilts towards the pointer, and some shapes spin.
 */
export class Swarm {
  readonly count: number;
  /** Extra stirring force, set from scroll velocity; decays by itself. */
  turbulence = 0;
  /** Called when the swarm starts forming a new shape, and when it is scattered (for sound). */
  onShape?: () => void;
  onShock?: () => void;
  private readonly pointer = { x: -1e5, y: -1e5 };

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(0, 1, 0, 1, -10, 10);
  private readonly fadeScene = new THREE.Scene();
  private readonly fadeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly material: THREE.ShaderMaterial;
  private readonly posAttr: THREE.BufferAttribute;
  private readonly speedAttr: THREE.BufferAttribute;

  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly target: Float32Array;
  private readonly next: Float32Array;
  private readonly release: Float32Array;
  private readonly stiffness: Float32Array;
  private readonly seed: Float32Array;
  private readonly speed: Float32Array;
  /** 1 = drawn in the accent colour. Each particle takes its new tint when it leaves. */
  private readonly tint: Float32Array;
  private readonly nextTint: Float32Array;
  private tintAttr!: THREE.BufferAttribute;
  private tintChanged = false;
  /** Under reduced motion, only draw when something changed. */
  private dirty = true;
  private dpr = Math.min(window.devicePixelRatio, 2);

  private readonly sampler = document.createElement('canvas');
  private width = window.innerWidth;
  private height = window.innerHeight;
  private time = 0;
  private wobble = 14;
  private alpha = 1;
  private targetAlpha = 1;
  private shape: Shape | null = null;
  private yaw = 0;
  private pitch = 0;
  private goalYaw = 0;
  private goalPitch = 0;
  private spinYaw = 0;
  private readonly pivot = new THREE.Vector2();
  private readonly pivotGoal = new THREE.Vector2();
  private lastFrame = performance.now();
  private geometry!: THREE.BufferGeometry;
  /** How many particles are simulated and drawn; lowered on machines that can't keep up. */
  private active = 0;
  private frameMs = 16.7;
  private lastCut = 0;
  private readonly bornAt = performance.now();

  constructor(
    canvas: HTMLCanvasElement,
    private readonly reducedMotion: boolean,
  ) {
    // Opaque canvas that is never fully cleared: each frame fades the last one towards the
    // background colour, which gives moving particles a short trail.
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    this.renderer.autoClear = false;
    this.renderer.setClearColor(BG, 1);

    const n = Math.round(Math.min(18000, Math.max(5500, (this.width * this.height) / 80)));
    this.count = n;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.target = new Float32Array(n * 3);
    this.next = new Float32Array(n * 3);
    this.release = new Float32Array(n).fill(Infinity);
    this.stiffness = new Float32Array(n);
    this.seed = new Float32Array(n);
    this.speed = new Float32Array(n);
    this.tint = new Float32Array(n);
    this.nextTint = new Float32Array(n);

    // Everything starts packed into one buzzing ball in the middle of the screen.
    // The first shape makes it burst open.
    const cx = this.width / 2;
    const cy = this.height * 0.42;
    this.pivot.set(cx, cy);
    this.pivotGoal.set(cx, cy);
    for (let i = 0; i < n; i++) {
      this.seed[i] = Math.random();
      this.stiffness[i] = 22 + Math.random() * 30;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * 10;
      this.pos[i * 3] = this.target[i * 3] = cx + Math.cos(a) * r;
      this.pos[i * 3 + 1] = this.target[i * 3 + 1] = cy + Math.sin(a) * r;
    }

    const geometry = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.speedAttr = new THREE.BufferAttribute(this.speed, 1).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', this.posAttr);
    geometry.setAttribute('aSpeed', this.speedAttr);
    this.tintAttr = new THREE.BufferAttribute(this.tint, 1).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('aTint', this.tintAttr);
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(this.seed, 1));

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uSize: { value: 2 },
        uPixelRatio: { value: 1 },
        uAlpha: { value: 1 },
        uStamp: { value: reducedMotion ? 1 : FADE },
        uPivot: { value: this.pivot },
        uYaw: { value: 0 },
        uPitch: { value: 0 },
        uPaper: { value: PAPER },
        uSignal: { value: SIGNAL },
      },
    });
    this.geometry = geometry;
    this.active = n;
    const points = new THREE.Points(geometry, this.material);
    points.frustumCulled = false;
    this.scene.add(points);

    // Three full-screen passes wipe the previous frame:
    // 1. blend towards the background, which leaves the trail;
    // 2. subtract one colour step and 3. clamp back up to the background. Without these, 8-bit
    //    rounding stops the fade one step short and old trails stay behind as a faint haze.
    const quad = new THREE.PlaneGeometry(2, 2);
    const step = new THREE.Color().setRGB(1.5 / 255, 1.5 / 255, 1.5 / 255, THREE.SRGBColorSpace);
    const passes = [
      new THREE.MeshBasicMaterial({ color: BG, transparent: true, opacity: reducedMotion ? 1 : FADE }),
      new THREE.MeshBasicMaterial({ color: step, blending: THREE.CustomBlending, blendEquation: THREE.ReverseSubtractEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor }),
      new THREE.MeshBasicMaterial({ color: BG, blending: THREE.CustomBlending, blendEquation: THREE.MaxEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor }),
    ];
    passes.forEach((material, i) => {
      material.depthTest = false;
      material.transparent = true;
      const mesh = new THREE.Mesh(quad, material);
      mesh.renderOrder = i;
      this.fadeScene.add(mesh);
    });
    this.resize();
  }

  resize() {
    // With an unchanged width, keep the tallest height seen (see onViewportChange). Growing
    // taller only extends the canvas: the shapes stay where they are and are not rebuilt.
    const sameWidth = window.innerWidth === this.width;
    this.width = window.innerWidth;
    this.height = sameWidth ? Math.max(this.height, window.innerHeight) : window.innerHeight;
    this.renderer.setPixelRatio(this.dpr);
    // Fixed pixel size (not 100%), so ignoring a small height change never stretches the swarm.
    this.renderer.setSize(this.width, this.height, true);
    this.renderer.clear();
    this.material.uniforms.uPixelRatio.value = this.dpr;
    this.camera.right = this.width;
    this.camera.bottom = this.height;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
    if (this.shape && !sameWidth) this.setShape(this.shape, { sweep: false });
  }

  setPointer(x: number, y: number) {
    this.pointer.x = x;
    this.pointer.y = y;
  }

  clearPointer() {
    this.pointer.x = this.pointer.y = -1e5;
  }

  /** Whether the current shape is turned by hand (the face) instead of following the pointer. */
  get grabbable() {
    return !!this.shape?.grab;
  }

  /** Where a grabbable shape should rotate to; it eases there by itself. */
  setRotation(yaw: number, pitch: number) {
    if (Math.abs(yaw - this.goalYaw) > 1e-4 || Math.abs(pitch - this.goalPitch) > 1e-4) this.dirty = true;
    this.goalYaw = yaw;
    this.goalPitch = pitch;
  }

  /** Blast particles away from a point. */
  /** A soft beat outwards from the middle of the current shape, in all three directions. */
  pulse(strength = 90) {
    if (this.reducedMotion) return;
    const px = this.pivotGoal.x;
    const py = this.pivotGoal.y;
    for (let i = 0; i < this.count; i++) {
      const dx = this.pos[i * 3] - px;
      const dy = this.pos[i * 3 + 1] - py;
      const dz = this.pos[i * 3 + 2];
      const d = Math.hypot(dx, dy, dz) + 1;
      const f = strength * (0.5 + this.seed[i]);
      this.vel[i * 3] += (dx / d) * f;
      this.vel[i * 3 + 1] += (dy / d) * f;
      this.vel[i * 3 + 2] += (dz / d) * f;
    }
  }

  shock(x: number, y: number, strength = 1400) {
    if (this.reducedMotion) return;
    this.onShock?.();
    for (let i = 0; i < this.count; i++) {
      const dx = this.pos[i * 3] - x;
      const dy = this.pos[i * 3 + 1] - y;
      const d = Math.hypot(dx, dy) + 1;
      if (d > 420) continue;
      const f = (1 - d / 420) * strength * (0.6 + this.seed[i] * 0.8);
      this.vel[i * 3] += (dx / d) * f;
      this.vel[i * 3 + 1] += (dy / d) * f;
      this.vel[i * 3 + 2] += (this.seed[i] - 0.5) * f;
    }
  }

  setShape(shape: Shape, { sweep = true } = {}) {
    if (shape === this.shape && sweep) return;
    this.dirty = true;
    const first = !this.shape;
    if (!first && sweep) this.onShape?.();
    this.shape = shape;
    this.wobble = this.reducedMotion ? 0 : shape.wobble;
    this.targetAlpha = shape.alpha;
    this.material.uniforms.uSize.value = (this.width < 700 ? 2.5 : 2.6) * (shape.size ?? 1);
    // A spinning shape may have turned many times; unwind so the next one doesn't spin back.
    this.yaw = wrapAngle(this.yaw);
    this.spinYaw = 0;

    const w = this.width;
    const h = this.height;
    const depth = shape.depth ?? 0;
    const xyz = shape.points?.(w, h, this.count);
    const points = xyz ? new Float32Array() : this.sample(shape);
    let sumX = 0;
    let sumY = 0;
    for (let i = 0; i < this.count; i++) {
      let x: number, y: number, z: number;
      if (xyz) {
        x = xyz[i * 3];
        y = xyz[i * 3 + 1];
        z = xyz[i * 3 + 2];
      } else {
        if (points.length) {
          const j = (Math.random() * (points.length / 2)) | 0;
          x = points[j * 2] + (Math.random() - 0.5) * 2;
          y = points[j * 2 + 1] + (Math.random() - 0.5) * 2;
        } else {
          x = Math.random() * w;
          y = Math.random() * h;
        }
        z = (Math.random() - 0.5) * depth;
      }
      sumX += x;
      sumY += y;
      this.next[i * 3] = x;
      this.next[i * 3 + 1] = y;
      this.next[i * 3 + 2] = z;
      this.nextTint[i] = shape.tint ? 1 : 0;
      // Particles leave in a wave from left to right (or top to bottom for a scan), with a bit
      // of randomness so it feels alive.
      const along = shape.scan ? y / h : x / w;
      const spread = shape.scan ? 1.1 : 0.45;
      this.release[i] = sweep && !this.reducedMotion ? this.time + Math.random() * (shape.scan ? 0.06 : 0.25) + along * spread : this.time;
    }

    // The swarm rotates around the middle of whatever it is forming.
    if (shape.pivot) this.pivotGoal.set(...shape.pivot(w, h));
    else if (points.length) this.pivotGoal.set(sumX / this.count, sumY / this.count);
    else this.pivotGoal.set(w / 2, h / 2);
    if (first || !sweep || this.reducedMotion) this.pivot.copy(this.pivotGoal);
  }

  /** Draw the shape offscreen at half resolution and return the centres of filled pixels. */
  private sample(shape: Shape): Float32Array {
    if (!shape.draw) return new Float32Array();
    const scale = 0.5;
    const cw = Math.ceil(this.width * scale);
    const ch = Math.ceil(this.height * scale);
    this.sampler.width = cw;
    this.sampler.height = ch;
    const ctx = this.sampler.getContext('2d', { willReadFrequently: true })!;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.fillStyle = ctx.strokeStyle = '#fff';
    shape.draw(ctx, this.width, this.height);
    const data = ctx.getImageData(0, 0, cw, ch).data;
    const out: number[] = [];
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        if (data[(y * cw + x) * 4 + 3] > 128) out.push(x / scale, y / scale);
      }
    }
    return Float32Array.from(out);
  }

  /** Advance the simulation and draw a frame. Call from the animation loop. */
  tick() {
    const now = performance.now();
    this.adaptQuality(now - this.lastFrame, now);
    // Fixed 60 Hz steps, so the motion is the same on a 30 Hz phone and a 144 Hz monitor.
    let elapsed = Math.min((now - this.lastFrame) / 1000, 0.1);
    this.lastFrame = now;
    while (elapsed > 1e-4) {
      const dt = Math.min(elapsed, 1 / 60);
      this.step(dt);
      elapsed -= dt;
    }
    // Under reduced motion nothing moves on its own: skip drawing an unchanged picture,
    // but finish any fade-in and redraw after a new shape, a resize or a turn of the head.
    const settled =
      Math.abs(this.targetAlpha - this.alpha) < 0.002 &&
      // Under reduced motion only a grabbed shape (the head) has a rotation goal; others rest at 0.
      Math.abs((this.shape?.grab ? this.goalYaw : 0) - this.yaw) < 1e-3 &&
      Math.abs((this.shape?.grab ? this.goalPitch : 0) - this.pitch) < 1e-3 &&
      this.pivot.distanceTo(this.pivotGoal) < 0.5;
    if (this.reducedMotion && !this.dirty && settled) return;
    this.dirty = false;
    this.posAttr.needsUpdate = true;
    this.speedAttr.needsUpdate = true;
    if (this.tintChanged) {
      this.tintAttr.needsUpdate = true;
      this.tintChanged = false;
    }
    this.renderer.render(this.fadeScene, this.fadeCamera);
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Keep it smooth on slower machines: if frames take longer than about 26 ms (under ~38 fps)
   * for a while, draw and simulate fewer particles, step by step, never below 5,000.
   * The first seconds after loading don't count (fonts, images and shaders are still loading),
   * and gaps over 100 ms are ignored: that is a background tab or a hiccup, not a slow machine.
   */
  private adaptQuality(frame: number, now: number) {
    if (frame > 100 || now < this.bornAt + 4000) return;
    this.frameMs += (frame - this.frameMs) * 0.03;
    if (this.frameMs < 26 || now - this.lastCut < 2000) return;
    this.lastCut = now;
    if (this.active > 5000) {
      this.active = Math.max(5000, Math.round(this.active * 0.8));
      this.geometry.setDrawRange(0, this.active);
    } else if (this.dpr > 1) {
      // Still slow with the fewest particles: filling the screen is the cost now, so draw at a
      // lower resolution. Last resort, because it makes the dots a little softer.
      this.dpr = Math.max(1, this.dpr - 0.5);
      this.renderer.setPixelRatio(this.dpr);
      this.renderer.setSize(this.width, this.height, true);
      this.renderer.clear();
      this.material.uniforms.uPixelRatio.value = this.dpr;
      this.frameMs = 20;
    }
  }

  private step(dt: number) {
    this.time += dt;
    const shape = this.shape;
    const still = this.reducedMotion;

    this.alpha += (this.targetAlpha - this.alpha) * Math.min(1, dt * 2.5);
    this.material.uniforms.uAlpha.value = this.alpha;
    this.turbulence *= Math.pow(0.04, dt);

    // Rotation: grabbable shapes are turned by hand, everything else leans towards the pointer.
    let goalYaw = 0;
    let goalPitch = 0;
    if (shape?.grab) {
      goalYaw = this.goalYaw;
      goalPitch = this.goalPitch;
    } else if (!still) {
      if (this.pointer.x > -1e4) {
        goalYaw = (this.pointer.x / this.width - 0.5) * 0.36;
        goalPitch = -(this.pointer.y / this.height - 0.5) * 0.26;
      }
      this.spinYaw += (shape?.spin ?? 0) * dt;
      goalYaw += this.spinYaw;
    }
    const ease = Math.min(1, dt * 6);
    this.yaw += (goalYaw - this.yaw) * ease;
    this.pitch += (goalPitch - this.pitch) * ease;
    this.pivot.lerp(this.pivotGoal, Math.min(1, dt * 4));
    this.material.uniforms.uYaw.value = this.yaw;
    this.material.uniforms.uPitch.value = this.pitch;

    const { pos, vel, target, next, release, stiffness, seed, speed } = this;
    const damping = Math.pow(0.86, dt * 60);
    const t = this.time;
    const wob = this.wobble;
    const slow = wob > 10 ? 0.25 : 1;
    const turb = this.turbulence + (still ? 0 : shape?.flow ?? 0);
    const solid = !!shape?.solid;
    const px0 = solid ? -1e5 : this.pointer.x;
    const py0 = solid ? -1e5 : this.pointer.y;
    const R = Math.max(90, Math.min(this.width, this.height) * 0.14);
    const R2 = R * R;

    for (let i = 0; i < this.active; i++) {
      const i3 = i * 3;
      if (t >= release[i]) {
        release[i] = Infinity;
        if (this.tint[i] !== this.nextTint[i]) {
          this.tint[i] = this.nextTint[i];
          this.tintChanged = true;
        }
        target[i3] = next[i3];
        target[i3 + 1] = next[i3 + 1];
        target[i3 + 2] = next[i3 + 2];
        if (still) {
          pos[i3] = target[i3];
          pos[i3 + 1] = target[i3 + 1];
          pos[i3 + 2] = target[i3 + 2];
        } else {
          const a = seed[i] * 6.283 + t;
          vel[i3] += Math.cos(a) * 160;
          vel[i3 + 1] += Math.sin(a) * 160;
        }
      }
      if (still) continue;

      const s = seed[i];
      let x = pos[i3];
      let y = pos[i3 + 1];
      const tx = target[i3] + Math.sin(t * (0.6 + s) * slow + s * 40) * wob;
      const ty = target[i3 + 1] + Math.cos(t * (0.5 + s * 0.8) * slow + s * 17) * wob;

      let ax = (tx - x) * stiffness[i];
      let ay = (ty - y) * stiffness[i];

      const dx = x - px0;
      const dy = y - py0;
      const d2 = dx * dx + dy * dy;
      if (d2 < R2 && d2 > 0.01) {
        const d = Math.sqrt(d2);
        const f = (1 - d / R) ** 2 * 26000;
        ax += (dx / d) * f;
        ay += (dy / d) * f;
      }

      if (turb > 1) {
        ax += Math.sin(y * 0.012 + t * 2 + s * 6) * turb;
        ay += Math.cos(x * 0.011 + t * 1.7 + s * 4) * turb;
      }

      const vx = (vel[i3] + ax * dt) * damping;
      const vy = (vel[i3 + 1] + ay * dt) * damping;
      const vz = (vel[i3 + 2] + (target[i3 + 2] - pos[i3 + 2]) * stiffness[i] * dt) * damping;
      vel[i3] = vx;
      vel[i3 + 1] = vy;
      vel[i3 + 2] = vz;
      x += vx * dt;
      y += vy * dt;
      pos[i3] = x;
      pos[i3 + 1] = y;
      pos[i3 + 2] += vz * dt;

      const sp = Math.min(1, Math.sqrt(vx * vx + vy * vy) / 900);
      speed[i] += (sp - speed[i]) * 0.2;
    }
  }
}
