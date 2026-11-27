import '@fontsource-variable/anybody/standard.css';
import '@fontsource-variable/instrument-sans/standard.css';
import './style.css';

import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { setupChat } from './chat';
import { about, experience, highlights, profile, skills, statement } from './content';
import { createRedactDemo } from './redact';
import { loadPortrait, shapes, textShape, type Shape } from './shapes';
import { Swarm } from './swarm';

gsap.registerPlugin(ScrollTrigger);

const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Content ---------- */

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function externalLink(href: string, label: string, className: string) {
  const a = el('a', className, label);
  a.href = href;
  if (!href.startsWith('mailto:')) {
    a.target = '_blank';
    a.rel = 'noopener';
  }
  return a;
}

$('[data-first]').textContent = profile.firstLine;
$('[data-second]').textContent = profile.secondLine;
$('[data-lede]').textContent = profile.lede;
$('[data-city]').textContent = profile.city;

const statementEl = $('[data-statement]');
statement.split(' ').forEach((word, i) => {
  if (i) statementEl.append(' ');
  statementEl.append(el('span', 'word', word));
});

$('[data-about-title]').textContent = about.title;
$('[data-about-body]').append(...about.body.map((p) => el('p', '', p)));
$('[data-about-facts]').append(
  ...about.facts.map(([term, value]) => {
    const row = el('div');
    row.append(el('dt', '', term), el('dd', '', value));
    return row;
  }),
);

$('[data-experience]').append(
  ...experience.map((job) => {
    const li = el('li', 'job');
    const head = el('div', 'job__head');
    head.append(el('h3', 'job__role', job.role), el('p', 'job__org', job.org));
    li.append(el('p', 'job__period', job.period), head);
    if (job.body) li.append(el('p', 'job__body', job.body));
    return li;
  }),
);

$('[data-highlights]').append(
  ...highlights.map((h) => {
    const article = el('article', 'project');
    article.id = h.id;
    article.dataset.shape = h.shape;
    const inner = el('div', 'project__inner');
    const tags = el('ul', 'project__tags');
    tags.setAttribute('aria-label', 'Built with');
    h.tags.forEach((t) => tags.append(el('li', '', t)));
    inner.append(el('p', 'project__metric', h.metric), el('h3', 'project__title', h.title), el('p', 'project__body', h.body), tags);
    if (h.demo) {
      inner.append(createRedactDemo('Mail Sanne at sanne@voorbeeld.nl or call 06 12345678. She lives at 1012 AB and her IBAN is NL91 ABNA 0417 1643 00.'));
    }
    if (h.link) inner.append(externalLink(h.link.href, h.link.label, 'project__link'));
    article.append(inner);
    return article;
  }),
);

$('[data-skills]').append(
  ...skills.map((group) => {
    const col = el('div', 'skills__group');
    const list = el('ul');
    group.items.forEach((item) => list.append(el('li', '', item)));
    col.append(el('h3', '', group.title), list);
    return col;
  }),
);

const contactLinks: [string, string][] = [
  [profile.email && `mailto:${profile.email}`, 'Email'],
  [profile.linkedin, 'LinkedIn'],
  [profile.github, 'GitHub'],
];
$('[data-links]').append(
  ...contactLinks
    .filter(([href]) => href)
    .map(([href, label]) => {
      const li = el('li');
      li.append(externalLink(href, label, 'contact__link'));
      return li;
    }),
);

// Many people have no mail app set up, so a mailto link alone does nothing for them.
// Clicking Email also copies the address and says so.
const contactStatus = $('[data-contact-status]');
let statusTimer = 0;
document.querySelector('a[href^="mailto:"]')?.addEventListener('click', () => {
  const show = (text: string) => {
    contactStatus.textContent = text;
    contactStatus.classList.add('is-visible');
    clearTimeout(statusTimer);
    statusTimer = window.setTimeout(() => contactStatus.classList.remove('is-visible'), 5000);
  };
  // Show the address straight away; copying can be blocked or slow, and must never hide it.
  show(`You can reach me at ${profile.email}.`);
  navigator.clipboard?.writeText(profile.email).then(
    () => show(`Copied ${profile.email} to your clipboard.`),
    () => undefined,
  );
});

/* ---------- Clock ---------- */

const clock = $('[data-clock]');
const clockFormat = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: profile.timeZone });
const tickClock = () => (clock.textContent = clockFormat.format(new Date()));
tickClock();
setInterval(tickClock, 10_000);

/* ---------- Swarm ---------- */

let swarm: Swarm | null = null;
try {
  swarm = new Swarm($<HTMLCanvasElement>('#swarm'), reducedMotion);
  document.documentElement.classList.add('has-swarm');
  if (import.meta.env.DEV) Object.assign(window, { swarm });
  $('[data-count]').textContent = swarm.count.toLocaleString('en');
} catch (err) {
  console.warn('WebGL unavailable, showing the page without the swarm.', err);
}

const nameShape = textShape([profile.firstLine, profile.secondLine]);
const shapeFor = (name: string): Shape => (name === 'name' ? nameShape : shapes[name] ?? shapes.drift);

const pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

if (swarm) {
  const s = swarm;
  gsap.ticker.add(() => s.tick());
  window.addEventListener('resize', () => s.resize());

  window.addEventListener(
    'pointermove',
    (e) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      s.setPointer(e.clientX, e.clientY);
    },
    { passive: true },
  );
  document.documentElement.addEventListener('pointerleave', () => s.clearPointer());
  window.addEventListener('pointerup', (e) => e.pointerType === 'touch' && s.clearPointer());
  window.addEventListener('blur', () => s.clearPointer());
  window.addEventListener('pointerdown', (e) => {
    if ((e.target as Element).closest('a, button, input, textarea, label, form, [data-face-stage]')) return;
    s.shock(e.clientX, e.clientY);
  });
}

/* ---------- The face: follows the pointer, and can be dragged around with momentum ---------- */

if (swarm) {
  const s = swarm;
  const stage = $('[data-face-stage]');
  // spin is in radians per second, so a throw feels the same at any frame rate.
  const face = { yaw: 0, pitch: 0, spin: 0, dragging: false, lastX: 0, lastY: 0, lastT: 0 };
  const TAU = Math.PI * 2;

  stage.addEventListener('pointerdown', (e) => {
    face.dragging = true;
    face.lastX = e.clientX;
    face.lastY = e.clientY;
    face.lastT = e.timeStamp;
    face.spin = 0;
    stage.setPointerCapture(e.pointerId);
    stage.classList.add('is-dragging');
  });
  stage.addEventListener('pointermove', (e) => {
    if (!face.dragging) return;
    const dx = e.clientX - face.lastX;
    const dy = e.clientY - face.lastY;
    const dt = Math.max(8, e.timeStamp - face.lastT) / 1000;
    face.lastX = e.clientX;
    face.lastY = e.clientY;
    face.lastT = e.timeStamp;
    face.yaw += dx * 0.009;
    face.pitch = Math.max(-0.7, Math.min(0.7, face.pitch - dy * 0.006));
    const v = Math.max(-14, Math.min(14, (dx * 0.009) / dt));
    face.spin += (v - face.spin) * 0.5;
  });
  const release = (e: PointerEvent) => {
    if (e.timeStamp - face.lastT > 80) face.spin = 0; // held still before letting go: no throw
    face.dragging = false;
    stage.classList.remove('is-dragging');
  };
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);

  gsap.ticker.add((time, deltaMs) => {
    if (!s.grabbable) return;
    const dt = Math.min(deltaMs / 1000, 0.1);
    if (!face.dragging) {
      // Keep spinning with the momentum of the throw, then settle facing the pointer.
      face.yaw += face.spin * dt;
      face.spin *= Math.exp(-dt * 2.2);
      const r = stage.getBoundingClientRect();
      const lookYaw = Math.max(-0.5, Math.min(0.5, (pointer.x - (r.left + r.width / 2)) / window.innerWidth)) + Math.sin(time * 0.6) * 0.06;
      const lookPitch = Math.max(-0.35, Math.min(0.35, -(pointer.y - (r.top + r.height / 2)) / window.innerHeight)) * 0.8;
      if (Math.abs(face.spin) < 1) {
        const settle = 1 - Math.exp(-dt * 3.5);
        const rest = lookYaw + Math.round((face.yaw - lookYaw) / TAU) * TAU;
        face.yaw += (rest - face.yaw) * settle;
        face.pitch += (lookPitch - face.pitch) * settle;
      }
    }
    s.setRotation(face.yaw, face.pitch);
  });
}

/* ---------- Smooth scroll ---------- */

const lenis = reducedMotion ? null : new Lenis({ lerp: 0.09 });
if (lenis) {
  lenis.on('scroll', ScrollTrigger.update);
  lenis.on('scroll', ({ velocity }: { velocity: number }) => {
    if (swarm) swarm.turbulence = Math.max(swarm.turbulence, Math.min(Math.abs(velocity) * 70, 1100));
  });
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
  if (import.meta.env.DEV) Object.assign(window, { lenis });
}

// The top bar gets out of the way while you read, and comes back as soon as you scroll up.
const bar = $('.bar');
let lastY = window.scrollY;
window.addEventListener(
  'scroll',
  () => {
    const y = window.scrollY;
    if (Math.abs(y - lastY) < 4) return;
    bar.classList.toggle('is-hidden', y > lastY && y > window.innerHeight * 0.5);
    lastY = y;
  },
  { passive: true },
);
bar.addEventListener('focusin', () => bar.classList.remove('is-hidden'));

document.querySelectorAll<HTMLAnchorElement>('a[data-scroll]').forEach((a) =>
  a.addEventListener('click', (e) => {
    const target = document.querySelector<HTMLElement>(a.getAttribute('href')!);
    if (!target) return;
    e.preventDefault();
    if (lenis) lenis.scrollTo(target, { duration: 1.6 });
    else target.scrollIntoView();
    history.replaceState(null, '', a.hash);
  }),
);

/* ---------- Ask: the AI chat ---------- */

let activeShape = '';
let chatBusy = false;
setupChat($('#ask'), {
  email: profile.email,
  suggestions: ['What does Titus do at Adami?', 'What is he best at?', 'Has he worked with clients?'],
  // While an answer is on its way, the sphere spins up. Only if you are still looking at it.
  onBusy(busy) {
    chatBusy = busy;
    if (activeShape === 'mind') swarm?.setShape(shapeFor(busy ? 'mindBusy' : 'mind'));
  },
  onResize: () => ScrollTrigger.refresh(),
});

/* ---------- Scroll choreography ---------- */

// Each section tells the swarm what to become while it is in the middle of the screen.
// Created after the font and portrait have loaded, so shapes are sampled from the real assets.
function bindShapes() {
  document.querySelectorAll<HTMLElement>('[data-shape]').forEach((section) => {
    ScrollTrigger.create({
      trigger: section,
      start: 'top 55%',
      end: 'bottom 45%',
      onToggle: (self) => {
        if (!self.isActive) return;
        activeShape = section.dataset.shape!;
        swarm?.setShape(shapeFor(activeShape === 'mind' && chatBusy ? 'mindBusy' : activeShape));
      },
    });
  });
}

if (!reducedMotion) {
  // The statement lights up word by word as you read it.
  gsap.fromTo(
    '.statement .word',
    { opacity: 0.16 },
    {
      opacity: 1,
      ease: 'none',
      stagger: 0.04,
      scrollTrigger: { trigger: '.statement', start: 'top 70%', end: 'bottom 55%', scrub: true },
    },
  );

  // Highlight titles stretch wide as they pass the centre of the screen, then condense again.
  document.querySelectorAll<HTMLElement>('.project').forEach((article) => {
    const title = article.querySelector('.project__title');
    gsap
      .timeline({ scrollTrigger: { trigger: article, start: 'top bottom', end: 'bottom top', scrub: 0.5 } })
      .fromTo(title, { '--wdth': 50, '--wght': 300 }, { '--wdth': 125, '--wght': 800, ease: 'power1.out' })
      .to(title, { '--wdth': 50, '--wght': 300, ease: 'power1.in' });
  });

  // The timeline draws itself as you scroll through it.
  gsap.fromTo(
    '.experience__list',
    { '--progress': 0 },
    {
      '--progress': 1,
      ease: 'none',
      scrollTrigger: { trigger: '.experience__list', start: 'top 70%', end: 'bottom 60%', scrub: true },
    },
  );
}

/* ---------- Intro ---------- */

async function intro() {
  await Promise.all([
    document.fonts.load(`800 100px "Anybody Variable"`).catch(() => undefined),
    loadPortrait(`${import.meta.env.BASE_URL}portrait.png`).catch((err) => console.warn('Portrait failed to load', err)),
  ]);
  bindShapes();
  ScrollTrigger.refresh();
  if (reducedMotion) return;
  gsap.from('.bar > *', { opacity: 0, y: -12, duration: 1, stagger: 0.08, delay: 1.1, ease: 'expo.out' });
  gsap.from('.hero__foot > *', { opacity: 0, y: 18, duration: 1.2, stagger: 0.12, delay: 1.3, ease: 'expo.out' });
}
intro();

/* ---------- Make the swarm say something ---------- */

const sayForm = $<HTMLFormElement>('[data-say]');
const sayInput = $<HTMLInputElement>('#say-input');

function openSay() {
  sayForm.hidden = false;
  requestAnimationFrame(() => sayForm.classList.add('is-open'));
  sayInput.value = '';
  sayInput.focus();
}

function closeSay() {
  sayForm.classList.remove('is-open');
  setTimeout(() => (sayForm.hidden = true), 300);
}

/** Break a phrase into at most three balanced lines. */
function toLines(text: string): string[] {
  const words = text.toUpperCase().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return words;
  const lines: string[] = [];
  const perLine = Math.ceil(text.length / Math.min(3, words.length));
  let line = '';
  for (const word of words) {
    if (line && (line + ' ' + word).length > perLine) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  lines.push(line);
  return lines;
}

$('[data-open-say]').addEventListener('click', openSay);
window.addEventListener('keydown', (e) => {
  const typing = (e.target as Element).closest('input, textarea');
  if (e.key === '/' && !typing) {
    e.preventDefault();
    openSay();
  } else if (e.key === 'Escape' && !sayForm.hidden) closeSay();
});
sayForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = sayInput.value.trim();
  if (text && swarm) swarm.setShape(textShape(toLines(text)));
  closeSay();
});
