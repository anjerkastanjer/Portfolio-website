// A shape is drawn in white on an offscreen canvas; the swarm then samples the filled pixels
// and every particle picks one of them as its target. Anything you can draw, the swarm can become.
// 3D shapes (the portrait) generate their own xyz targets instead.

export type Shape = {
  draw?: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  /** Generate `count` xyz targets directly, for shapes with depth. */
  points?: (w: number, h: number, count: number) => Float32Array;
  /** Screen point the swarm rotates around. Defaults to the middle of the shape. */
  pivot?: (w: number, h: number) => [number, number];
  /** Thickness in px given to a drawn shape, so it has some body when the swarm tilts. */
  depth?: number;
  /** Constant slow rotation, in radians per second. */
  spin?: number;
  /** Constant gentle current that keeps the particles streaming. */
  flow?: number;
  /** Turned by dragging (the face) instead of leaning towards the pointer. */
  grab?: boolean;
  /** How far particles drift around their target, in px. */
  wobble: number;
  /** Overall opacity of the swarm while this shape is active. */
  alpha: number;
  /** Particles ignore the pointer's push. */
  solid?: boolean;
  /** Particle size multiplier; smaller dots show more detail. */
  size?: number;
};

type Region = { x: number; y: number; w: number; h: number };

const isWide = (w: number) => w >= 900;

/** Where a shape lives on screen: the hero is centred, other shapes sit beside (or above) the text. */
function region(w: number, h: number, place: 'center' | 'side' | 'top'): Region {
  if (place === 'center') {
    return isWide(w)
      ? { x: w * 0.05, y: h * 0.16, w: w * 0.9, h: h * 0.5 }
      : { x: w * 0.05, y: h * 0.14, w: w * 0.9, h: h * 0.5 };
  }
  if (place === 'top' || !isWide(w)) {
    return isWide(w)
      ? { x: w * 0.1, y: h * 0.1, w: w * 0.8, h: h * 0.4 }
      : { x: w * 0.08, y: h * 0.1, w: w * 0.84, h: h * 0.32 };
  }
  return { x: w * 0.52, y: h * 0.16, w: w * 0.42, h: h * 0.68 };
}

/** Fit a square of the largest possible size inside a region, centred. */
function square(r: Region, scale = 1): Region {
  const s = Math.min(r.w, r.h) * scale;
  return { x: r.x + (r.w - s) / 2, y: r.y + (r.h - s) / 2, w: s, h: s };
}

const DISPLAY = '"Anybody Variable", system-ui, sans-serif';

function drawText(ctx: CanvasRenderingContext2D, lines: string[], r: Region, stretch: CanvasFontStretch = 'semi-expanded') {
  const probe = 100;
  ctx.font = `800 ${probe}px ${DISPLAY}`;
  ctx.fontStretch = stretch;
  const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
  const lineH = 0.86;
  const size = Math.min((r.w / widest) * probe, r.h / (lines.length * lineH));
  ctx.font = `800 ${size}px ${DISPLAY}`;
  ctx.fontStretch = stretch; // assigning ctx.font resets the stretch, so set it again
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const total = lines.length * size * lineH;
  lines.forEach((line, i) => {
    ctx.fillText(line, r.x + r.w / 2, r.y + (r.h - total) / 2 + size * lineH * (i + 0.5));
  });
}

export function textShape(lines: string[], place: 'center' | 'top' | 'side' = 'center'): Shape {
  return {
    wobble: 0.7,
    alpha: 1,
    depth: 44,
    // Narrow screens get condensed letters, so the name can be set larger.
    draw: (ctx, w, h) => drawText(ctx, lines, region(w, h, place), isWide(w) ? 'semi-expanded' : 'condensed'),
  };
}

/* ---------- Portrait ---------- */

let portrait: ImageData | null = null;
let depthMap: ImageData | null = null;

async function readImage(src: string) {
  const img = new Image();
  img.src = src;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = c.height = 200;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, 200, 200);
  return ctx.getImageData(0, 0, 200, 200);
}

/**
 * Load the cut-out portrait and its depth map once; the face shape reads their pixels.
 * The depth map was sculpted around the detected eyes, nose, mouth and chin (see README).
 */
export async function loadPortrait(src: string, depthSrc: string) {
  [portrait, depthMap] = await Promise.all([readImage(src), readImage(depthSrc).catch(() => null)]);
}

const faceBox = (w: number, h: number) => square(region(w, h, 'side'), isWide(w) ? 1 : 1.15);

/**
 * The portrait as a 3D point cloud. Bright pixels get more particles (a stipple), and depth comes
 * from an ellipsoid head shape plus a little extra for lit areas like the nose and cheeks.
 */
const face: Shape = {
  wobble: 0.5,
  alpha: 1,
  solid: true,
  grab: true,
  size: 0.74,
  pivot(w, h) {
    const r = faceBox(w, h);
    return [r.x + r.w / 2, r.y + r.h * 0.42];
  },
  points(w, h, count) {
    const out = new Float32Array(count * 3);
    if (!portrait) return out;
    const r = faceBox(w, h);
    const { data, width: pw, height: ph } = portrait;
    let n = 0;
    for (let guard = 0; n < count && guard < count * 80; guard++) {
      const px = Math.random() * pw;
      const py = Math.random() * ph;
      const i = ((py | 0) * pw + (px | 0)) * 4;
      if (data[i + 3] < 140) continue;
      const lum = data[i] / 255;
      const u = (px / pw) * 2 - 1;
      const v = (py / ph) * 2 - 1;
      const fade = v > 0.5 ? Math.max(0, 1 - (v - 0.5) / 0.45) : 1;
      if (Math.random() > (0.02 + 0.98 * lum ** 2.4) * fade) continue;
      let z: number;
      if (depthMap) {
        // The depth map stores 0..1.5 as 0..255; centred so the head turns around its own middle.
        z = r.w * ((depthMap.data[i] / 255) * 1.5 * 0.3 - 0.17);
      } else {
        const hv = v + 0.18;
        const head = Math.sqrt(Math.max(0, 1 - u * u * 1.5 - hv * hv * 0.9));
        const shoulders = v > 0.42 ? (v - 0.42) * 0.5 : 0;
        z = r.w * (0.3 * head + 0.04 * lum - shoulders);
      }
      out[n * 3] = r.x + (px / pw) * r.w;
      out[n * 3 + 1] = r.y + (py / ph) * r.h;
      out[n * 3 + 2] = z;
      n++;
    }
    for (let i = n; i < count; i++) out.copyWithin(i * 3, ((Math.random() * n) | 0) * 3, ((Math.random() * n) | 0) * 3 + 3);
    return out;
  },
};

/* ---------- Highlight shapes ---------- */

/** A little game character, as a pixel sprite. */
const sprite: Shape = {
  wobble: 0.8,
  alpha: 1,
  depth: 40,
  draw(ctx, w, h) {
    const art = [
      '....######....',
      '..##########..',
      '.############.',
      '.###..##..###.',
      '.###..##..###.',
      '.############.',
      '.############.',
      '.##.######.##.',
      '.###......###.',
      '..##########..',
      '....######....',
      '...##....##...',
      '..###....###..',
    ];
    const r = square(region(w, h, 'side'), 0.9);
    const cell = r.w / art[0].length;
    const gap = cell * 0.12;
    const top = r.y + (r.h - art.length * cell) / 2;
    art.forEach((row, y) =>
      [...row].forEach((c, x) => {
        if (c === '#') ctx.fillRect(r.x + x * cell + gap, top + y * cell + gap, cell - gap * 2, cell - gap * 2);
      }),
    );
  },
};

/** A sphere of points: the assistant. It turns slowly, and faster while it is answering. */
function mindShape(spin: number, wobble: number): Shape {
  return {
    wobble,
    alpha: 1,
    solid: true,
    spin,
    size: 0.8,
    pivot(w, h) {
      const r = region(w, h, 'side');
      return [r.x + r.w / 2, r.y + r.h / 2];
    },
    points(w, h, count) {
      const r = square(region(w, h, 'side'), 0.9);
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      const radius = r.w * 0.42;
      const golden = Math.PI * (3 - Math.sqrt(5));
      const out = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        // most points on the shell, a fifth scattered inside as a core
        const shell = i % 5 ? 1 : Math.cbrt(Math.random()) * 0.55;
        const y = 1 - ((i + 0.5) / count) * 2;
        const ring = Math.sqrt(1 - y * y);
        const a = i * golden;
        out[i * 3] = cx + Math.cos(a) * ring * radius * shell;
        out[i * 3 + 1] = cy + y * radius * shell;
        out[i * 3 + 2] = Math.sin(a) * ring * radius * shell;
      }
      return out;
    },
  };
}

/** A paragraph of thin "text" lines, with some words blacked out as detected personal data. */
const redact: Shape = {
  wobble: 1,
  alpha: 1,
  depth: 16,
  draw(ctx, w, h) {
    const r = region(w, h, 'side');
    const rows = 7;
    const rowH = r.h / rows;
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let row = 0; row < rows; row++) {
      let x = r.x;
      const y = r.y + row * rowH + rowH / 2;
      const end = r.x + r.w * (row === rows - 1 ? 0.55 : 1);
      while (x < end) {
        const wordW = Math.min(r.w * (0.06 + rand() * 0.16), end - x);
        const secret = rand() < 0.22;
        const barH = secret ? rowH * 0.62 : Math.max(3, rowH * 0.1);
        ctx.beginPath();
        ctx.roundRect(x, y - barH / 2, wordW, barH, secret ? 4 : barH / 2);
        ctx.fill();
        x += wordW + r.w * 0.025;
      }
    }
  },
};

/** A timesheet: a ruled table with handwritten scribbles in the cells. */
const sheet: Shape = {
  wobble: 1,
  alpha: 1,
  depth: 16,
  draw(ctx, w, h) {
    const r = region(w, h, 'side');
    const cols = [0, 0.38, 0.62, 0.81, 1];
    const rows = 7;
    const rowH = r.h / rows;
    const line = Math.max(2, r.h * 0.006);
    for (let i = 0; i <= rows; i++) ctx.fillRect(r.x, r.y + i * rowH - line / 2, r.w, i === 1 ? line * 2.5 : line);
    for (const c of cols) ctx.fillRect(r.x + c * r.w - line / 2, r.y, line, r.h);
    ctx.lineWidth = Math.max(3, r.h * 0.011);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    let seed = 3;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let row = 0; row < rows; row++) {
      for (let c = 0; c < cols.length - 1; c++) {
        const x0 = r.x + cols[c] * r.w + r.w * 0.025;
        const cellW = (cols[c + 1] - cols[c]) * r.w - r.w * 0.05;
        const len = cellW * (row === 0 ? 0.6 : 0.4 + rand() * 0.55);
        const cy = r.y + row * rowH + rowH * 0.55;
        const amp = rowH * (row === 0 ? 0.1 : 0.18);
        const freq = 0.12 + rand() * 0.08;
        ctx.beginPath();
        for (let x = 0; x <= len; x += 2) {
          const y = cy + Math.sin(x * freq + rand() * 0.6) * amp * (0.6 + 0.4 * Math.sin(x * 0.05));
          if (x === 0) ctx.moveTo(x0 + x, y);
          else ctx.lineTo(x0 + x, y);
        }
        ctx.stroke();
      }
    }
  },
};

/** One agent in the middle, connected to the tools it may use on someone's behalf. */
const hub: Shape = {
  wobble: 1.2,
  alpha: 1,
  depth: 50,
  draw(ctx, w, h) {
    const r = square(region(w, h, 'side'), 0.95);
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const n = 7;
    const ring = r.w * 0.38;
    const node = r.w * 0.065;
    ctx.lineWidth = Math.max(3, r.w * 0.012);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      const x = cx + Math.cos(a) * ring;
      const y = cy + Math.sin(a) * ring;
      ctx.beginPath();
      ctx.setLineDash([r.w * 0.012, r.w * 0.02]);
      ctx.moveTo(cx + Math.cos(a) * node * 2.2, cy + Math.sin(a) * node * 2.2);
      ctx.lineTo(x - Math.cos(a) * node * 1.2, y - Math.sin(a) * node * 1.2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(x, y, node, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, node * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, node * 1.7, 0, Math.PI * 2);
    ctx.fill();
  },
};

/** No drawing: particles spread out through the whole space and stream around. */
const drift: Shape = { wobble: 30, alpha: 0.36, depth: 700, flow: 90 };

export const shapes: Record<string, Shape> = {
  drift,
  face,
  sprite,
  mind: mindShape(0.3, 1.5),
  // Everything collapses into one bright point: the way into the 3D deck.
  portal: {
    wobble: 0,
    alpha: 1,
    solid: true,
    points(w, h, count) {
      const out = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() ** 2 * 6;
        out[i * 3] = w / 2 + Math.cos(a) * r;
        out[i * 3 + 1] = h / 2 + Math.sin(a) * r;
      }
      return out;
    },
  },
  mindBusy: mindShape(2.2, 7),
  redact,
  sheet,
  hub,
  talk: textShape(['LET’S', 'TALK'], 'top'),
};
