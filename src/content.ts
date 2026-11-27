// All copy on the site lives here. Edit freely — the page is generated from this file.
// Highlights pick a swarm shape by name; see src/shapes.ts for the available ones.

export const profile = {
  name: 'Titus Driessen',
  firstLine: 'TITUS',
  secondLine: 'DRIESSEN',
  role: 'AI engineer & full-stack developer',
  lede: 'AI engineer and full-stack developer in Amsterdam. I build secure AI products, from the first client conversation to software in production.',
  city: 'Amsterdam',
  timeZone: 'Europe/Amsterdam',
  email: 'tts.driessen@gmail.com',
  linkedin: 'https://www.linkedin.com/in/titus-driessen-0970a734a',
  github: 'https://github.com/anjerkastanjer',
};

export const statement =
  'Every dot on this page is a tiny agent. None of them knows the plan. Each one follows a few simple rules, and together they spell things out. That is roughly my job: I turn a vague problem into clear rules, and make sure the AI that follows them does useful, safe work.';

export const about = {
  title: 'Hi, I’m Titus.',
  body: [
    'What drives me is turning a vague problem into a clear one. I like sitting down with clients, finding out what they actually need, and then building it properly.',
    'I enjoy working with large datasets and tuning a system until it is as accurate and efficient as it can be. The best part is seeing that work turn into a product with real users.',
  ],
  facts: [
    ['Based in', 'Amsterdam'],
    ['Studied', 'BSc Computer Science, Hogeschool Leiden'],
    ['Speaks', 'Dutch, English, some German'],
  ] as [string, string][],
};

export type Job = { period: string; role: string; org: string; body: string };

export const experience: Job[] = [
  {
    period: '2026 – now',
    role: 'AI Engineer',
    org: 'Adami AI',
    body: 'Core developer of Beluga, a self-hostable private-GPT platform for organisations. I build the parts that make AI safe to use at work: PII detection, per-user permissions for agents, and pipelines that turn paper into data.',
  },
  {
    period: '2025 – 2026',
    role: 'PC Technician',
    org: 'PC Rider, Amsterdam',
    body: 'Diagnosing, repairing and building PCs.',
  },
  {
    period: '2023 – 2025',
    role: 'Freelance IT Specialist',
    org: 'OGD, Delft',
    body: 'Weekly assignments in very different technical environments.',
  },
  {
    period: '2022 – 2025',
    role: 'Freelance Developer',
    org: 'Upwork',
    body: 'Web and Flutter apps for international clients, from scoping to delivery.',
  },
  {
    period: '2018 – 2020',
    role: 'Data Manager',
    org: 'Gladwell Academy, Amsterdam',
    body: '',
  },
];

export type Highlight = {
  id: string;
  metric: string;
  title: string;
  body: string;
  tags: string[];
  shape: string;
  /** Adds the live redaction demo under the text. */
  demo?: boolean;
  /** Adds the playable mini-game under the text. */
  game?: boolean;
  link?: { href: string; label: string };
};

export const highlights: Highlight[] = [
  {
    id: 'pii',
    metric: 'F1 0.998 on 350,000 PII spans',
    title: 'Personal data stays private',
    body: 'An API that masks names, addresses and IDs in Dutch and English text before it reaches an external LLM. Rules, a BERT model and an LLM reviewer work in layers; the reviewer removed 11,869 false alarms and lost only 17 real ones.',
    tags: ['FastAPI', 'BERT NER', 'LLM review', '411+ tests'],
    shape: 'redact',
    demo: true,
  },
  {
    id: 'timesheets',
    metric: '2–3 FTE of typing saved',
    title: 'Handwriting into the ERP',
    body: 'Around 160 handwritten timesheets a day, read by AI and booked straight into the ERP. I benchmarked 11 OCR and vision models; now two of them check each other, so 97% of numbers go through untouched, for under $0.10 a form.',
    tags: ['Vision LLMs', 'OCR', 'Benchmarking'],
    shape: 'sheet',
  },
  {
    id: 'mcp',
    metric: 'OAuth 2.1 with PKCE',
    title: 'Agents with your permissions',
    body: 'A per-user login layer for MCP servers. The AI agent acts with each person’s own rights in Google Workspace, HubSpot, Monday.com and many other tools, never with more.',
    tags: ['MCP', 'OAuth 2.1', 'Security'],
    shape: 'hub',
  },
  {
    id: 'games',
    metric: 'Outside of work',
    title: 'Games, and the rest',
    body: 'Next to work I make games in Godot, like Sword of the Emperor, which I built with a team of three others. And a good part of what I have made for clients lives in private repositories. Ask me about it.',
    tags: ['Godot', 'GDScript', 'Game design'],
    shape: 'sprite',
    game: true,
  },
];

export const skills: { title: string; items: string[] }[] = [
  {
    title: 'AI and data',
    items: ['LLM agents and MCP', 'NER and PII anonymisation', 'Model benchmarking', 'Data analysis and statistics'],
  },
  {
    title: 'Engineering',
    items: ['TypeScript and Python', 'Vue, Nuxt, Node', 'PostgreSQL', 'Docker, CI/CD, OAuth 2.1', 'Flutter, Java, PHP', 'Game development in Godot'],
  },
  {
    title: 'Design and people',
    items: ['UX research and usability tests', 'Accessibility (WCAG)', 'Client demos', 'Clear technical writing'],
  },
];
