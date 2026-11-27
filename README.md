# Portfolio-website

This is my portfolio webpage, feel free to look around and see just a little taste of what I'm capable of!

Every dot on the page is a tiny agent: up to eighteen thousand particles that burst out of a single point, spell my name, turn into my face in 3D (drag it around), and reshape themselves for every section as you scroll. The whole swarm leans towards your pointer and leaves light trails when it moves. Press `/` to make it spell anything you type.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build in dist/
```

## Where things live

- `src/content.ts`: all the copy (profile, experience, highlights, skills). Edit this to change the text.
- `src/shapes.ts`: everything the swarm can turn into. A shape is just a drawing on a canvas.
- `src/swarm.ts`: the particle engine (Three.js points, spring physics, 3D rotation).
- `src/redact.ts`: the live PII redaction demo (a toy rules layer that runs in the browser).
- `src/chat.ts` + `api/chat.ts`: the AI chat (browser side and the Vercel function behind it).
- `src/game.ts`: the 30-second mini-game that scores you with F1.
- `deck.html` + `src/deck/`: the separate 3D deck page (lit scenes, the numbers at real scale).
- `src/main.ts`: scroll choreography (GSAP + Lenis), the draggable face, and the `/` command.
- `public/portrait.png`: the cut-out photo the 3D face is sampled from.

## Deploy (Vercel)

The site is hosted on Vercel: import this repo at vercel.com and every push to `main` deploys.

The "Ask" chat runs through `api/chat.ts` and works with any provider that has an OpenAI-compatible
chat endpoint (for example the free tiers of Google Gemini or Groq). Set three environment variables
in Vercel under Settings → Environment Variables, then redeploy:

| Variable | Value |
| --- | --- |
| `AI_API_KEY` | your API key from the provider |
| `AI_BASE_URL` | the provider's OpenAI-compatible base URL, e.g. `https://generativelanguage.googleapis.com/v1beta/openai` or `https://api.groq.com/openai/v1` |
| `AI_MODEL` | a chat model name from that provider |

Without them the site still works; the chat just says it is not connected.
