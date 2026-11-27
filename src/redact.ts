// A toy version of a rules layer for PII detection: a handful of patterns, run in the browser.
// The real system adds a BERT model and an LLM reviewer on top; this only shows the idea.

const rules: [label: string, pattern: RegExp][] = [
  ['EMAIL', /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g],
  ['IBAN', /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,3})?\b/g],
  ['PHONE', /(?:\+|\b00)\d{2}[ -]?\(?0?\)?[ -]?\d(?:[ -]?\d){7,9}\b|\b0\d(?:[ -]?\d){8}\b/g],
  ['DATE', /\b\d{1,2}[-/.]\d{1,2}[-/.](?:\d{4}|\d{2})\b/g],
  ['POSTCODE', /\b\d{4} ?[A-Z]{2}\b/g],
];

type Hit = { start: number; end: number; label: string };

export function findPII(text: string): Hit[] {
  const hits: Hit[] = [];
  for (const [label, pattern] of rules) {
    for (const m of text.matchAll(pattern)) {
      const start = m.index;
      const end = start + m[0].length;
      // earlier rules win when two patterns claim the same characters
      if (!hits.some((h) => start < h.end && end > h.start)) hits.push({ start, end, label });
    }
  }
  return hits.sort((a, b) => a.start - b.start);
}

/** Build the demo: a text field, and the same text underneath with the personal data masked. */
export function createRedactDemo(sample: string): HTMLElement {
  const root = document.createElement('div');
  root.className = 'demo';

  const label = document.createElement('label');
  label.className = 'demo__label';
  label.htmlFor = 'demo-input';
  label.textContent = 'Try it. Type something personal:';

  const input = document.createElement('textarea');
  input.className = 'demo__input';
  input.id = 'demo-input';
  input.rows = 3;
  input.spellcheck = false;
  input.value = sample;

  const out = document.createElement('p');
  out.className = 'demo__out';
  out.setAttribute('aria-live', 'polite');

  const note = document.createElement('p');
  note.className = 'demo__note';
  note.textContent =
    'This toy version only knows patterns, and it runs in your browser. A name like Sanne slips through, which is exactly why the real system adds a language model and a reviewer.';

  let shown = 0;
  const render = () => {
    const text = input.value;
    const nodes: (string | HTMLElement)[] = [];
    const hits = findPII(text);
    let at = 0;
    for (const [i, hit] of hits.entries()) {
      nodes.push(text.slice(at, hit.start));
      const mark = document.createElement('mark');
      mark.textContent = hit.label;
      if (i >= shown) mark.className = 'is-new'; // only a newly caught item pops in
      nodes.push(mark);
      at = hit.end;
    }
    nodes.push(text.slice(at));
    shown = hits.length;
    out.replaceChildren(...nodes);
    if (!text.trim()) out.textContent = 'Nothing to hide yet.';
  };
  input.addEventListener('input', render);
  render();

  root.append(label, input, out, note);
  return root;
}
