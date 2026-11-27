// The 404 page: the swarm spells 404, drifts apart now and then, and regroups.
import '@fontsource-variable/anybody/standard.css';
import '@fontsource-variable/instrument-sans/standard.css';
import './style.css';

import { gsap } from 'gsap';
import { shapes, textShape } from './shapes';
import { Swarm, onViewportChange } from './swarm';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let swarm: Swarm | null = null;
try {
  swarm = new Swarm(document.querySelector<HTMLCanvasElement>('#swarm')!, reducedMotion);
  document.documentElement.classList.add('has-swarm');
} catch {
  // Without WebGL the plain heading is shown instead.
}

if (swarm) {
  const s = swarm;
  gsap.ticker.add(() => s.tick());
  onViewportChange(() => s.resize());
  window.addEventListener('pointermove', (e) => s.setPointer(e.clientX, e.clientY), { passive: true });
  window.addEventListener('pointerdown', (e) => {
    if (!(e.target as Element).closest('a')) s.shock(e.clientX, e.clientY);
  });

  const lost = textShape(['404']);
  document.fonts.load('800 100px "Anybody Variable"').finally(() => {
    s.setShape(lost);
    if (reducedMotion) return;
    // Every few seconds the swarm loses its way, then finds the number again.
    let searching = false;
    setInterval(() => {
      searching = !searching;
      s.setShape(searching ? shapes.drift : lost);
    }, 3200);
  });
}
