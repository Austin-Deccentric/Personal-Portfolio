// Homepage hero text choreography: the headline types key by key, the cursor backs
// onto the struck word and draws the line through it, then the subcopy types out and
// the buttons and footer line appear. Reduced motion shows the finished text.
// mountReadingRoomHero() returns a cleanup that stops every timer and listener.

export interface HeadlineSegment {
  text: string;
  /** Typed, then crossed out by the cursor. */
  strike?: boolean;
  /** Terracotta serif italic, like `.accent` elsewhere on the site. */
  accent?: boolean;
}

export interface HeroConfig {
  headline: HeadlineSegment[];
}

export function mountReadingRoomHero(root: HTMLElement, cfg: HeroConfig): () => void {
  const typedEl = root.querySelector<HTMLElement>('[data-typed]')!;
  const ledeEl = root.querySelector<HTMLElement>('[data-type-lede]');
  const reveals = [...root.querySelectorAll<HTMLElement>('[data-reveal]')];

  const mq = matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = mq.matches;
  root.classList.toggle('rr-anim', !reduced);

  // ───────────── timers ─────────────
  const timers = new Set<number>();
  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => { timers.delete(id); fn(); }, ms);
    timers.add(id);
  };
  const clearTimers = () => { timers.forEach(clearTimeout); timers.clear(); };
  let sweepRaf = 0;

  // ───────────── text ─────────────
  let chars: { el: HTMLElement | null; seg: HeadlineSegment }[] = [];
  let strikeEl: HTMLElement | null = null;
  let strikeChars: HTMLElement[] = [];
  let ledeChars: HTMLElement[] = [];
  const cursor = document.createElement('span');
  cursor.className = 'rr-cursor';

  const charSpan = (ch: string) => {
    const c = document.createElement('span');
    c.className = 'rr-c';
    c.textContent = ch;
    return c;
  };

  function buildHeadline() {
    typedEl.textContent = '';
    chars = []; strikeChars = [];
    for (const seg of cfg.headline) {
      let host: HTMLElement = typedEl;
      if (seg.strike || seg.accent) {
        host = document.createElement('span');
        host.className = seg.strike ? 'rr-strike' : 'rr-accent';
        typedEl.appendChild(host);
        if (seg.strike) strikeEl = host;
      }
      for (const part of seg.text.split(/( )/)) {
        if (!part) continue;
        if (part === ' ') { host.appendChild(document.createTextNode(' ')); chars.push({ el: null, seg }); continue; }
        const word = document.createElement('span');
        word.className = 'rr-w';
        for (const ch of part) {
          const c = charSpan(ch);
          word.appendChild(c);
          chars.push({ el: c, seg });
          if (seg.strike) strikeChars.push(c);
        }
        host.appendChild(word);
      }
      if (seg.strike) {
        const line = document.createElement('span');
        line.className = 'rr-line';
        host.appendChild(line);
      }
    }
    typedEl.appendChild(cursor);
  }

  // The subcopy types out too; words stay unbroken so lines never reflow while typing.
  function buildLede() {
    if (!ledeEl) return;
    const text = ledeEl.textContent!.replace(/\s+/g, ' ').trim();
    ledeEl.textContent = '';
    ledeChars = [];
    text.split(/( )/).forEach((part) => {
      if (!part) return;
      if (part === ' ') { ledeEl.appendChild(document.createTextNode(' ')); return; }
      const w = document.createElement('span');
      w.className = 'rr-w';
      for (const ch of part) { const c = charSpan(ch); w.appendChild(c); ledeChars.push(c); }
      ledeEl.appendChild(w);
    });
  }

  const visibleChars = () => chars.filter((c) => c.el).map((c) => c.el!);
  function cursorAt(x: number, el: HTMLElement) {
    const b = typedEl.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    cursor.style.transform = `translate(${x - b.left}px, ${r.top - b.top + r.height * 0.17}px)`;
  }
  const after = (el: HTMLElement) => cursorAt(el.getBoundingClientRect().right + 3, el);

  function settleText() {
    visibleChars().forEach((el) => el.classList.add('on'));
    ledeChars.forEach((el) => el.classList.add('on'));
    strikeEl?.classList.add('struck');
    after(visibleChars().at(-1)!);
    cursor.classList.toggle('blink', !reduced);
    reveals.forEach((el) => el.classList.add('on'));
  }

  function playText() {
    clearTimers();
    cancelAnimationFrame(sweepRaf);
    reveals.forEach((el) => el.classList.remove('on'));
    strikeEl?.classList.remove('struck');
    strikeEl?.style.setProperty('--p', '0');
    visibleChars().forEach((el) => el.classList.remove('on'));
    ledeChars.forEach((el) => el.classList.remove('on'));
    cursorAt(visibleChars()[0].getBoundingClientRect().left, visibleChars()[0]);
    cursor.classList.add('blink');
    let i = 0;

    const step = () => {
      cursor.classList.remove('blink');
      while (i < chars.length && !chars[i].el) i++;
      if (i >= chars.length) return typeLede();
      const c = chars[i++];
      c.el!.classList.add('on');
      after(c.el!);
      const endOfStrike = c.seg.strike && (i >= chars.length || chars[i].seg !== c.seg);
      if (endOfStrike) return later(crossOut, 360);
      const next = chars[i];
      later(step, 52 + Math.random() * 50 + (next && !next.el ? 50 : 0));
    };

    // The cursor jumps back onto the word, then sweeps right drawing the line.
    const crossOut = () => {
      const first = strikeChars[0];
      cursorAt(first.getBoundingClientRect().left, first);
      later(() => {
        const r0 = first.getBoundingClientRect();
        const r1 = strikeChars[strikeChars.length - 1].getBoundingClientRect();
        const t0 = performance.now();
        const run = (now: number) => {
          const p = Math.min(1, (now - t0) / 420);
          const e = 1 - Math.pow(1 - p, 2);
          strikeEl!.style.setProperty('--p', e.toFixed(3));
          cursorAt(r0.left + (r1.right + 3 - r0.left) * e, first);
          if (p < 1) sweepRaf = requestAnimationFrame(run);
          else { strikeEl!.classList.add('struck'); later(step, 380); }
        };
        sweepRaf = requestAnimationFrame(run);
      }, 260);
    };

    const typeLede = () => {
      cursor.classList.add('blink');
      let k = 0;
      const tick = () => {
        // a few characters per tick, so the subcopy lands quickly
        for (let n = 0; n < 3 && k < ledeChars.length; n++) ledeChars[k++].classList.add('on');
        if (k < ledeChars.length) later(tick, 16);
        else reveals.forEach((el, j) => later(() => el.classList.add('on'), 140 + j * 160));
      };
      later(tick, 320);
    };
    later(step, 650);
  }

  const onMotionPref = () => {
    reduced = mq.matches;
    root.classList.toggle('rr-anim', !reduced);
    clearTimers();
    cancelAnimationFrame(sweepRaf);
    if (reduced) settleText();
    else playText();
  };
  mq.addEventListener('change', onMotionPref);

  // Links don't get :active on Enter, so show the key press briefly.
  const keys = [...root.querySelectorAll<HTMLElement>('.key')];
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const k = e.currentTarget as HTMLElement;
    k.classList.add('pressed');
    later(() => k.classList.remove('pressed'), 140);
  };
  keys.forEach((k) => k.addEventListener('keydown', onKey));

  buildHeadline();
  buildLede();
  root.classList.remove('rr-pending');
  // Text waits for fonts so the cursor lands on real glyph positions.
  let textStarted = false;
  const startText = () => { if (textStarted) return; textStarted = true; reduced ? settleText() : playText(); };
  document.fonts.ready.then(startText);
  later(startText, 1500); // don't hold the page if a font is slow

  return () => {
    clearTimers();
    cancelAnimationFrame(sweepRaf);
    mq.removeEventListener('change', onMotionPref);
    keys.forEach((k) => k.removeEventListener('keydown', onKey));
  };
}
