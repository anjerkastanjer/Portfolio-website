// The "Ask" section: a small chat that sends questions to /api/chat and streams the answer in.

type Turn = { role: 'user' | 'assistant'; content: string };

type Options = {
  email: string;
  suggestions: string[];
  /** Called when a question is sent and again when the answer has finished. */
  onBusy: (busy: boolean) => void;
  /** Called whenever the section changes height. */
  onResize: () => void;
  /** Shown once, under the first answer: a next step for the visitor. */
  followUp?: () => HTMLElement;
};

export function setupChat(root: HTMLElement, { email, suggestions, onBusy, onResize, followUp }: Options) {
  let followedUp = false;
  const log = root.querySelector<HTMLElement>('[data-ask-log]')!;
  const chips = root.querySelector<HTMLElement>('[data-ask-suggestions]')!;
  const form = root.querySelector<HTMLFormElement>('[data-ask-form]')!;
  const input = form.querySelector('input')!;
  const button = form.querySelector('button')!;

  const history: Turn[] = [];
  let busy = false;

  const failures: Record<string, string> = {
    offline: `The assistant is not connected on this copy of the site. You can ask me directly at ${email}.`,
    busy: 'That is a lot of questions in a short time. Give it a minute and try again.',
    error: `Something went wrong on my side. Try again, or ask me directly at ${email}.`,
  };

  function add(className: string, text: string) {
    const p = document.createElement('p');
    p.className = className;
    p.textContent = text;
    log.append(p);
    return p;
  }

  async function ask(question: string) {
    question = question.trim();
    if (!question || busy) return;
    busy = true;
    button.disabled = true;
    chips.hidden = true;
    input.value = '';
    onBusy(true);

    add('ask__q', question);
    const answer = add('ask__a is-waiting', '');
    // Screen readers: say that an answer is coming, and read the answer once, when it is
    // complete, instead of re-reading it after every streamed piece.
    const thinking = document.createElement('span');
    thinking.className = 'sr-only';
    thinking.textContent = 'Thinking…';
    answer.append(thinking);
    log.setAttribute('aria-busy', 'true');
    onResize();
    history.push({ role: 'user', content: question });

    let text = '';
    let failure = '';
    let cutOff = false;
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: history }),
      });
      if (res.status === 429) failure = failures.busy;
      else if (res.status === 404 || res.status === 405 || res.status === 503) failure = failures.offline;
      else if (!res.ok || !res.body) failure = failures.error;
      else {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          text += decoder.decode(value, { stream: true });
          answer.classList.remove('is-waiting');
          answer.textContent = text;
        }
        if (!text.trim()) failure = failures.error;
      }
    } catch {
      // The connection dropped. With part of an answer, keep it but say so, and don't keep
      // the half answer as context for the next question.
      if (text) cutOff = true;
      else failure = failures.offline;
    }

    answer.classList.remove('is-waiting');
    log.setAttribute('aria-busy', 'false');
    if (cutOff) {
      answer.textContent = `${text}… (the answer was cut off; try asking again)`;
      history.pop();
    } else if (failure) {
      answer.textContent = failure;
      answer.classList.add('is-error');
      history.pop(); // the question went unanswered; don't send it again as context
    } else {
      history.push({ role: 'assistant', content: text });
      if (followUp && !followedUp) {
        followedUp = true;
        log.append(followUp());
      }
    }
    busy = false;
    button.disabled = false;
    onBusy(false);
    onResize();
  }

  for (const s of suggestions) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = s;
    b.addEventListener('click', () => {
      // The suggestions hide while answering; keep keyboard focus where the conversation is.
      input.focus();
      ask(s);
    });
    li.append(b);
    chips.append(li);
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    ask(input.value);
  });
}
