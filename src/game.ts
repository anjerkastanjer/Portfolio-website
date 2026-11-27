// "Be the filter": a 30-second game. Words fall; you catch the personal data and let the rest
// pass. At the end you get the same score my real detector is measured with: F1.

const PII = [
  'sanne@mail.nl', '06 12345678', 'NL91 ABNA 0417', 'J. de Vries', '1012 AB', '12-03-1994',
  'Keizersgracht 12', 'p.jansen@werk.nl', '+31 20 555 0199', 'Fatima El Idrissi', 'born 4 May 1988',
  'passport NX4K2L9', 'tom@bakker.com', 'Dr. A. Smit', '3511 LX Utrecht',
];
const SAFE = [
  'invoice', 'Tuesday', 'meeting', 'thanks!', 'coffee', 'report', 'Q3 results', 'deadline', 'hello',
  'budget', 'lunch at 12', 'update', 'agenda', 'printer', 'version 2.1', 'room 4', 'see attached',
  '100 units', 'next week', 'good morning',
];

const DURATION = 30;
const MY_F1 = 0.998;
const BEST_KEY = 'filter-game-best';

// The visitor's best score lives in their own browser only. Storage can be blocked
// (private windows, strict settings), so every access is wrapped.
function readBest(): number | null {
  try {
    const v = Number.parseFloat(localStorage.getItem(BEST_KEY) ?? '');
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}
function saveBest(v: number) {
  try {
    localStorage.setItem(BEST_KEY, String(v));
  } catch {
    // not saved; the score still shows for this visit
  }
}

type Item = { text: string; pii: boolean; x: number; y: number; w: number; speed: number; hit: number };

export function createGame(): HTMLElement {
  const root = document.createElement('div');
  root.className = 'game';
  root.innerHTML = `
    <p class="game__result" role="status" hidden></p>
    <div class="game__intro">
      <p class="game__title">Play: be the filter</p>
      <p>Words fall for 30 seconds. Catch the personal data, let everything else through. Move with your mouse, finger or the arrow keys.</p>
      <button type="button" class="game__start">Start</button>
    </div>
    <canvas class="game__canvas" hidden aria-label="Game: catch falling personal data"></canvas>`;
  const intro = root.querySelector<HTMLElement>('.game__intro')!;
  const start = root.querySelector<HTMLButtonElement>('.game__start')!;
  const canvas = root.querySelector<HTMLCanvasElement>('.game__canvas')!;
  const result = root.querySelector<HTMLElement>('.game__result')!;
  const ctx = canvas.getContext('2d')!;
  const css = getComputedStyle(document.documentElement);
  const paper = css.getPropertyValue('--paper').trim() || '#f4f1ea';
  const signal = css.getPropertyValue('--signal').trim() || '#ff6b2c';
  const muted = css.getPropertyValue('--muted').trim() || '#9c988f';

  let w = 0;
  let h = 0;
  let items: Item[] = [];
  let catcher = 0.5; // 0..1 across the field
  let keyDir = 0;
  let timeLeft = 0;
  let nextSpawn = 0;
  let last = 0;
  let raf = 0;
  let caught = 0;
  let missed = 0;
  let falseAlarms = 0;
  let flash = 0;
  let flashGood = true;

  const barW = () => Math.max(90, w * 0.2);

  function fit() {
    const dpr = Math.min(window.devicePixelRatio, 2);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function spawn(elapsed: number) {
    const pii = Math.random() < 0.5;
    const list = pii ? PII : SAFE;
    const text = list[(Math.random() * list.length) | 0];
    ctx.font = '600 16px "Instrument Sans Variable", system-ui, sans-serif';
    const tw = ctx.measureText(text).width;
    items.push({
      text,
      pii,
      w: tw,
      x: 8 + Math.random() * Math.max(1, w - tw - 16),
      y: -10,
      speed: 70 + elapsed * 4.5 + Math.random() * 30,
      hit: 0,
    });
  }

  function frame(now: number) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    timeLeft -= dt;
    const elapsed = DURATION - timeLeft;

    catcher = Math.min(1, Math.max(0, catcher + keyDir * dt * 1.4));
    nextSpawn -= dt;
    if (nextSpawn <= 0 && timeLeft > 1.5) {
      spawn(elapsed);
      nextSpawn = Math.max(0.36, 0.85 - elapsed * 0.017);
    }

    const bw = barW();
    const bx = catcher * (w - bw);
    const by = h - 26;
    for (const it of items) {
      if (it.hit) {
        it.hit += dt;
        continue;
      }
      it.y += it.speed * dt;
      if (it.y >= by && it.y <= by + 22 && it.x + it.w > bx && it.x < bx + bw) {
        it.hit = 0.001;
        if (it.pii) caught++;
        else falseAlarms++;
        flash = 0.25;
        flashGood = it.pii;
      } else if (it.y > h + 14) {
        it.hit = 1;
        if (it.pii) missed++;
      }
    }
    items = items.filter((it) => it.hit < 0.5);
    flash = Math.max(0, flash - dt);

    // draw
    ctx.clearRect(0, 0, w, h);
    ctx.font = '600 16px "Instrument Sans Variable", system-ui, sans-serif';
    ctx.textBaseline = 'alphabetic';
    for (const it of items) {
      if (it.hit) {
        // a caught item turns into a redaction bar (personal data) or fades out (a false alarm)
        ctx.globalAlpha = 1 - it.hit / 0.5;
        ctx.fillStyle = it.pii ? paper : muted;
        if (it.pii) ctx.fillRect(it.x - 3, it.y - 14, it.w + 6, 18);
        else ctx.fillText(it.text, it.x, it.y);
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = paper;
        ctx.fillText(it.text, it.x, it.y);
      }
    }
    ctx.fillStyle = flash > 0 && !flashGood ? muted : signal;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, 10, 5);
    ctx.fill();

    // The score sits on a dark band so falling words never run through it.
    ctx.fillStyle = 'rgb(9 9 11 / 0.85)';
    ctx.fillRect(0, 0, w, 30);
    ctx.fillStyle = muted;
    const narrow = w < 460;
    ctx.font = `500 ${narrow ? 12 : 14}px "Instrument Sans Variable", system-ui, sans-serif`;
    ctx.fillText(`${Math.max(0, Math.ceil(timeLeft))}s`, 10, 20);
    const score = narrow
      ? `caught ${caught}  missed ${missed}  false ${falseAlarms}`
      : `caught ${caught}   missed ${missed}   false alarms ${falseAlarms}`;
    ctx.fillText(score, w - ctx.measureText(score).width - 10, 20);

    if (timeLeft <= 0 && items.length === 0) return finish();
    raf = requestAnimationFrame(frame);
  }

  function finish() {
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('keyup', onKey);
    const denominator = 2 * caught + falseAlarms + missed;
    const f1 = denominator ? (2 * caught) / denominator : 0;
    canvas.hidden = true;
    result.hidden = false;
    const verdict =
      f1 >= MY_F1 ? 'You beat my detector. Want a job?' : f1 >= 0.9 ? 'Sharp. But my detector still wins.' : 'Reading fast is hard. That is why I built a detector.';
    const best = readBest();
    const record = best === null || f1 > best;
    if (record) saveBest(f1);
    const bestLine = best === null ? '' : record ? ` New personal best, up from ${best.toFixed(3)}.` : ` Your best so far: ${best.toFixed(3)}.`;
    result.textContent = `You caught ${caught}, missed ${missed} and raised ${falseAlarms} false alarm${falseAlarms === 1 ? '' : 's'}. That is an F1 of ${f1.toFixed(3)}. Mine scores ${MY_F1} on 350,000 of these. ${verdict}${bestLine}`;
    start.textContent = 'Play again';
    intro.hidden = false;
    intro.querySelectorAll('p').forEach((p) => (p.hidden = true));
  }

  function onKey(e: KeyboardEvent) {
    const dir = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
    if (!dir) return;
    e.preventDefault();
    if (e.type === 'keydown') keyDir = dir;
    else if (keyDir === dir) keyDir = 0;
  }

  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    catcher = Math.min(1, Math.max(0, (e.clientX - r.left - barW() / 2) / Math.max(1, r.width - barW())));
  });

  start.addEventListener('click', () => {
    intro.hidden = true;
    result.hidden = true;
    canvas.hidden = false;
    fit();
    items = [];
    caught = missed = falseAlarms = 0;
    timeLeft = DURATION;
    nextSpawn = 0.3;
    keyDir = 0;
    last = performance.now();
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    canvas.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    raf = requestAnimationFrame(frame);
  });

  return root;
}
