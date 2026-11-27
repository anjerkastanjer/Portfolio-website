// Draw mode: sketch anything with the mouse or a finger, and the swarm becomes your drawing.

import type { Shape } from './shapes';

type Point = [number, number];

export function setupDraw(onShape: (shape: Shape) => void, onClose: () => void) {
  const overlay = document.createElement('div');
  overlay.className = 'draw';
  overlay.hidden = true;
  overlay.innerHTML = `
    <canvas class="draw__canvas" aria-label="Drawing area"></canvas>
    <div class="draw__bar">
      <p class="draw__hint">Draw something. The swarm copies it when you let go.</p>
      <button type="button" class="draw__clear">Clear</button>
      <button type="button" class="draw__done">Done</button>
    </div>`;
  document.body.append(overlay);

  const canvas = overlay.querySelector('canvas')!;
  const ctx = canvas.getContext('2d')!;
  const strokes: Point[][] = [];
  let current: Point[] | null = null;
  let timer = 0;
  const LINE = () => Math.max(14, Math.min(window.innerWidth, window.innerHeight) * 0.022);

  function paint(target: CanvasRenderingContext2D, alpha: number) {
    target.lineCap = target.lineJoin = 'round';
    target.lineWidth = LINE();
    target.globalAlpha = alpha;
    for (const s of strokes) {
      target.beginPath();
      s.forEach(([x, y], i) => (i ? target.lineTo(x, y) : target.moveTo(x, y)));
      if (s.length === 1) target.lineTo(s[0][0] + 0.1, s[0][1]);
      target.stroke();
    }
    target.globalAlpha = 1;
  }

  function redraw() {
    const dpr = Math.min(window.devicePixelRatio, 2);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--signal').trim() || '#ff6b2c';
    paint(ctx, 0.35);
  }

  function fit() {
    const dpr = Math.min(window.devicePixelRatio, 2);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    redraw();
  }

  function send() {
    if (!strokes.some((s) => s.length)) return;
    // Copy the strokes, so later drawing doesn't change a shape the swarm is already forming.
    const snapshot = strokes.map((s) => s.slice());
    onShape({
      wobble: 0.8,
      alpha: 1,
      depth: 30,
      draw: (c) => {
        c.lineCap = c.lineJoin = 'round';
        c.lineWidth = LINE();
        for (const s of snapshot) {
          c.beginPath();
          s.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
          if (s.length === 1) c.lineTo(s[0][0] + 0.1, s[0][1]);
          c.stroke();
        }
      },
    });
  }

  canvas.addEventListener('pointerdown', (e) => {
    clearTimeout(timer);
    canvas.setPointerCapture(e.pointerId);
    current = [[e.clientX, e.clientY]];
    strokes.push(current);
    redraw();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!current) return;
    current.push([e.clientX, e.clientY]);
    redraw();
  });
  const end = () => {
    if (!current) return;
    current = null;
    // Wait a moment, so a drawing made of several strokes is sent as a whole.
    timer = window.setTimeout(send, 450);
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  overlay.querySelector('.draw__clear')!.addEventListener('click', () => {
    strokes.length = 0;
    redraw();
  });
  overlay.querySelector('.draw__done')!.addEventListener('click', close);
  window.addEventListener('resize', () => !overlay.hidden && fit());

  function open() {
    strokes.length = 0;
    overlay.hidden = false;
    document.documentElement.classList.add('is-drawing');
    fit();
  }

  function close() {
    clearTimeout(timer);
    overlay.hidden = true;
    document.documentElement.classList.remove('is-drawing');
    onClose();
  }

  return { open, close, get isOpen() { return !overlay.hidden; } };
}
