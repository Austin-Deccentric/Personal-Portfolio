// Reading-room hero, choreographed like a typed page coming apart:
//   1. the portrait fades in as fine stipple while the headline types key by key;
//   2. the cursor backs onto the struck word and draws the line through it, and at
//      that moment the head starts to break away from the crown;
//   3. the break grows into a large stream of dashes and letters blowing up and
//      to the right, then keeps shedding in a loop;
//   4. the subcopy types out, then the buttons and the footer line appear.
// mountReadingRoomHero() returns a cleanup that stops every timer, frame and observer.

export interface HeadlineSegment {
  text: string;
  /** Typed, then crossed out by the cursor. */
  strike?: boolean;
  /** Terracotta serif italic, like `.accent` elsewhere on the site. */
  accent?: boolean;
}

export interface HeroConfig {
  portraitSrc: string;
  headline: HeadlineSegment[];
  /** Ink colour for the stipple and the stream, as [r, g, b]. */
  ink: [number, number, number];
  /** Stipple dot size in CSS px. */
  cell: number;
  words: string[];
}

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const FONT_STACK = '"Courier Prime", "Courier New", monospace';
const BREAK_GROW_S = 3.2; // how long the break takes to reach full size
const BREAK_DEPTH = 0.4; // how much of the head band ends up broken away (0–1)

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const easeOut = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

type Kind = 'dash' | 'dot' | 'char' | 'word';
interface Particle {
  x: number; y: number; vx: number; vy: number;
  age: number; life: number; ph: number; kind: Kind;
  len: number; s: string; size: number;
}

export function mountReadingRoomHero(root: HTMLElement, cfg: HeroConfig): () => void {
  const typedEl = root.querySelector<HTMLElement>('[data-typed]')!;
  const ledeEl = root.querySelector<HTMLElement>('[data-type-lede]');
  const reveals = [...root.querySelectorAll<HTMLElement>('[data-reveal]')];
  const stage = root.querySelector<HTMLElement>('[data-stage]')!;
  const canvas = root.querySelector<HTMLCanvasElement>('[data-canvas]')!;
  const ctx = canvas.getContext('2d')!;
  const inkCss = `rgb(${cfg.ink.join(',')})`;
  const INK = new Uint32Array(new Uint8ClampedArray([...cfg.ink, 255]).buffer)[0];

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
    breakT = -1;
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
    // The head starts breaking away as the line is drawn.
    const crossOut = () => {
      const first = strikeChars[0];
      cursorAt(first.getBoundingClientRect().left, first);
      later(() => {
        const r0 = first.getBoundingClientRect();
        const r1 = strikeChars[strikeChars.length - 1].getBoundingClientRect();
        const t0 = performance.now();
        startBreak();
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
        // a few characters per tick: fast, like the video's body copy
        for (let n = 0; n < 3 && k < ledeChars.length; n++) ledeChars[k++].classList.add('on');
        if (k < ledeChars.length) later(tick, 16);
        else reveals.forEach((el, j) => later(() => el.classList.add('on'), 140 + j * 160));
      };
      later(tick, 320);
    };
    later(step, 650);
  }

  // ───────────── portrait ─────────────
  const img = new Image();
  let gw = 0, gh = 0, cell = 2, dpr = 1, W = 0, H = 0, narrow = false;
  let tone = new Float32Array(0), thresh = new Float32Array(0);
  let erodeKey = new Float32Array(0); // < 0: never breaks; else lower breaks first
  let headCells = new Int32Array(0); // head cells sorted by erodeKey
  let small: HTMLCanvasElement | null = null, sctx: CanvasRenderingContext2D | null = null;
  let simg: ImageData | null = null, buf32 = new Uint32Array(0);
  let particles: Particle[] = [];
  let raf = 0, running = false, visible = true, startT = 0, lastT = 0, breakT = -1, emitAcc = 0, wordAcc = 0;
  let ready = false;
  let rng = Math.random;

  function layout() {
    const r = stage.getBoundingClientRect();
    if (!r.width || !r.height || !img.naturalWidth) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.round(r.width * dpr); H = Math.round(r.height * dpr);
    canvas.width = W; canvas.height = H;
    cell = Math.max(1, Math.round(cfg.cell * dpr));
    gw = Math.ceil(W / cell); gh = Math.ceil(H / cell);
    narrow = window.innerWidth < 900;

    // Fill the right side like the reference: the figure is as wide as most of the stage,
    // the head sits about a fifth of the way down, and the body runs off the bottom.
    // On tall screens height decides; on wide screens width does (the waist is cropped more).
    const HEAD_TOP = 0.155; // crown position in the source photo, as a share of its height
    const fitH = (gh * (narrow ? 0.86 : 0.92)) / img.naturalHeight;
    const fitW = (gw * (narrow ? 0.8 : 0.88)) / img.naturalWidth;
    // ...but never so large that the head stops fitting (very wide, short screens).
    const scale = Math.min(Math.max(fitH, fitW), (gh * 1.15) / img.naturalHeight);
    const dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
    const dx = gw * (narrow ? 0.5 : 0.56) - dw / 2;
    const dy = Math.min(gh - dh * 0.97, gh * (narrow ? 0.2 : 0.17) - dh * HEAD_TOP);

    const tmp = document.createElement('canvas');
    tmp.width = gw; tmp.height = gh;
    const tctx = tmp.getContext('2d', { willReadFrequently: true })!;
    tctx.imageSmoothingQuality = 'high';
    tctx.drawImage(img, dx, dy, dw, dh);
    const px = tctx.getImageData(0, 0, gw, gh).data;

    const n = gw * gh, dark = new Float32Array(n), alpha = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = px[i * 4 + 3] / 255;
      const l = (0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]) / 255;
      alpha[i] = a;
      dark[i] = (1 - l) * a; // ink = darkness, like print
    }
    const rad = Math.max(2, Math.round(3 * (gw / 500)));
    const blurred = boxBlur(dark, gw, gh, rad);
    tone = new Float32Array(n); thresh = new Float32Array(n); erodeKey = new Float32Array(n).fill(-1);

    // Head box from the silhouette: top row, and its width across the upper band.
    let headTop = gh;
    for (let i = 0; i < n; i++) if (alpha[i] > 0.5) { headTop = (i / gw) | 0; break; }
    const headH = dh * 0.36; // crown to chin in this crop
    let minX = gw, maxX = 0;
    for (let y = headTop; y < Math.min(gh, headTop + headH * 0.6); y++) for (let x = 0; x < gw; x++) {
      if (alpha[y * gw + x] > 0.5) { if (x < minX) minX = x; if (x > maxX) maxX = x; }
    }
    const headW = Math.max(1, maxX - minX);

    // smooth random field so the break edge is ragged, not a straight line
    const noise = new Float32Array(n);
    for (let i = 0; i < n; i++) noise[i] = Math.random();
    const nb = boxBlur(boxBlur(noise, gw, gh, Math.max(2, rad * 2)), gw, gh, Math.max(2, rad * 2));

    const head: number[] = [];
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const i = y * gw + x;
      thresh[i] = Math.random(); // stipple: random threshold per dot
      let v = Math.pow(dark[i], 1.1) * 1.08 + 1.7 * (dark[i] - blurred[i]);
      v *= smooth(0.04, 0.35, alpha[i]);
      if (!narrow) v *= smooth(0.0, 0.08, x / gw);
      tone[i] = Math.max(0, Math.min(1, v));

      // break order: crown and back of the head first, the face last
      const dy = (y - headTop) / headH;
      if (alpha[i] > 0.3 && dy >= -0.02 && dy < 0.75) {
        const dx = (x - minX) / headW; // 0 left .. 1 right
        const lean = narrow ? 0.5 : 1 - dx; // right side (back of the stream) goes first
        erodeKey[i] = dy * 0.9 + lean * 0.55 + (nb[i] - 0.5) * 2.2 * 0.2;
        if (tone[i] > 0.05) head.push(i);
      }
    }
    head.sort((a, b) => erodeKey[a] - erodeKey[b]);
    headCells = Int32Array.from(head);

    small = document.createElement('canvas');
    small.width = gw; small.height = gh;
    sctx = small.getContext('2d')!;
    simg = sctx.createImageData(gw, gh);
    buf32 = new Uint32Array(simg.data.buffer);
    ready = true;
  }

  function boxBlur(src: Float32Array, w: number, h: number, r: number) {
    const tmp = new Float32Array(src.length), out = new Float32Array(src.length), k = 2 * r + 1;
    for (let y = 0; y < h; y++) {
      let s = 0;
      for (let x = -r; x <= r; x++) s += src[y * w + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) {
        tmp[y * w + x] = s / k;
        s += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let y = -r; y <= r; y++) s += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) {
        out[y * w + x] = s / k;
        s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
      }
    }
    return out;
  }

  // Break front: key value below which the head is gone. Grows, then breathes so it keeps shedding.
  const keyRange = () => (headCells.length ? [erodeKey[headCells[0]], erodeKey[headCells[headCells.length - 1]]] : [0, 1]);
  function frontAt(sinceBreak: number) {
    if (sinceBreak < 0) return -Infinity;
    const [k0, k1] = keyRange();
    const grow = easeOut(sinceBreak / BREAK_GROW_S);
    const breathe = sinceBreak > BREAK_GROW_S ? Math.sin((sinceBreak - BREAK_GROW_S) * 0.9) * 0.025 : 0;
    return k0 + (k1 - k0) * (BREAK_DEPTH * grow + breathe * grow);
  }

  function paint(gain: number, front: number, jitterSeed: number) {
    const n = gw * gh;
    const edge = 0.05 * (keyRange()[1] - keyRange()[0]);
    for (let i = 0; i < n; i++) {
      let on = tone[i] * gain > thresh[i];
      if (on && erodeKey[i] >= 0) {
        const d = erodeKey[i] - front;
        if (d < 0) on = false;
        else if (d < edge) on = ((i * 2654435761 + jitterSeed) >>> 0) % 1000 > 1000 * (1 - d / edge) * 0.8; // crumbling edge
      }
      buf32[i] = on ? INK : 0;
    }
    sctx!.putImageData(simg!, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small!, 0, 0, gw * cell, gh * cell);
  }

  // Emit from cells sitting on the break front.
  function emit(front: number, kind: Kind) {
    if (!headCells.length) return;
    const [k0, k1] = keyRange();
    const band = (k1 - k0) * 0.08;
    let lo = lowerBound(front - band), hi = lowerBound(front + band * 0.3);
    if (hi <= lo) { lo = 0; hi = Math.max(1, lowerBound(front)); }
    const idx = headCells[lo + Math.floor(rng() * (hi - lo))];
    if (idx === undefined) return;
    const gx = idx % gw, gy = (idx / gw) | 0;
    const d = dpr;
    // wind: up and to the right on desktop, mostly up on phones
    const ang = (narrow ? -1.35 : -0.72) + (rng() - 0.5) * 0.7;
    const speed = (kind === 'word' ? 26 : 18 + rng() * 80) * d;
    const p: Particle = {
      x: gx * cell, y: gy * cell,
      vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
      age: 0, ph: rng() * 6.283, kind,
      life: kind === 'word' ? 4.5 + rng() * 2 : 2.2 + rng() * 3.2,
      len: (3 + rng() * 9) * d, s: '', size: 0,
    };
    if (kind === 'char') { p.s = LETTERS[Math.floor(rng() * LETTERS.length)]; p.size = (9 + rng() * 6) * d; }
    if (kind === 'word') { p.s = cfg.words[Math.floor(rng() * cfg.words.length)]; p.size = (11 + rng() * 2) * d; }
    particles.push(p);
  }
  function lowerBound(v: number) {
    let a = 0, b = headCells.length;
    while (a < b) { const m = (a + b) >> 1; if (erodeKey[headCells[m]] < v) a = m + 1; else b = m; }
    return a;
  }

  function step(dt: number, time: number) {
    const max = narrow ? 1200 : 3000;
    if (particles.length > max) particles.splice(0, particles.length - max);
    const d = dpr;
    for (let k = particles.length - 1; k >= 0; k--) {
      const p = particles[k];
      p.age += dt;
      if (p.age > p.life || p.y < -40 || p.x > W + 80 || p.x < -80) { particles.splice(k, 1); continue; }
      // turbulence: a slowly turning flow so the stream curls instead of falling in straight lines
      const swirl = Math.sin(p.y * 0.006 / d + time * 0.8 + p.ph) * 0.6 + Math.sin(p.x * 0.005 / d - time * 0.6) * 0.4;
      const acc = (p.kind === 'word' ? 6 : 28) * d;
      p.vx += (Math.cos(swirl - 0.9) * acc * 0.6) * dt;
      p.vy += (Math.sin(swirl - 1.6) * acc) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  function drawParticles() {
    ctx.fillStyle = inkCss;
    ctx.strokeStyle = inkCss;
    ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(1, Math.round(1.2 * dpr));
    ctx.lineCap = 'butt';
    const dashes: Particle[][] = [[], [], [], []];
    const dots: Particle[][] = [[], [], [], []];
    let font = '';
    for (const p of particles) {
      const t = p.age / p.life;
      const a = Math.min(1, p.age / 0.15) * (1 - t * t) * smooth(0, H * 0.08, p.y);
      if (a <= 0.03) continue;
      const b = Math.min(3, (a * 4) | 0);
      if (p.kind === 'dash') { dashes[b].push(p); continue; }
      if (p.kind === 'dot') { dots[b].push(p); continue; }
      const f = p.kind === 'word'
        ? `italic 400 ${Math.round(p.size)}px ${FONT_STACK}`
        : `700 ${Math.round(p.size)}px ${FONT_STACK}`;
      if (f !== font) { ctx.font = f; font = f; }
      ctx.globalAlpha = p.kind === 'word' ? a * 0.85 : a;
      ctx.fillText(p.s, Math.round(p.x), Math.round(p.y));
    }
    for (let b = 0; b < 4; b++) {
      ctx.globalAlpha = (b + 1) / 4;
      if (dashes[b].length) {
        ctx.beginPath();
        for (const p of dashes[b]) {
          const sp = Math.hypot(p.vx, p.vy) || 1;
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - (p.vx / sp) * p.len, p.y - (p.vy / sp) * p.len);
        }
        ctx.stroke();
      }
      if (dots[b].length) {
        const s = Math.max(1, Math.round(1.5 * dpr));
        for (const p of dots[b]) ctx.fillRect(Math.round(p.x), Math.round(p.y), s, s);
      }
    }
    ctx.globalAlpha = 1;
  }

  function spawnFor(dt: number, front: number, sinceBreak: number) {
    if (sinceBreak < 0) return;
    const growing = sinceBreak < BREAK_GROW_S;
    const rate = (narrow ? 0.45 : 1) * (growing ? 1300 : 650); // particles per second
    emitAcc += dt * rate;
    while (emitAcc >= 1) {
      const r = rng();
      emit(front, r < 0.62 ? 'dash' : r < 0.86 ? 'dot' : 'char');
      emitAcc--;
    }
    wordAcc += dt * 1.1;
    while (wordAcc >= 1) { emit(front, 'word'); wordAcc--; }
  }

  function frame(ts: number) {
    raf = 0;
    if (!running || !visible) return;
    const dt = Math.min(0.05, (ts - (lastT || ts)) / 1000);
    lastT = ts;
    const t = (ts - startT) / 1000;
    const sinceBreak = breakT < 0 ? -1 : (ts - breakT) / 1000;
    const front = frontAt(sinceBreak);
    // fade in: faint first, then full contrast
    const gain = 0.35 * smooth(0.1, 0.6, t) + 0.65 * smooth(0.6, 1.6, t);
    spawnFor(dt, front, sinceBreak);
    step(dt, t);
    paint(gain, front, (ts / 70) | 0);
    drawParticles();
    raf = requestAnimationFrame(frame);
  }

  function startBreak() {
    if (breakT < 0) breakT = performance.now();
  }

  // Still frame for reduced motion: the break at full size and a settled stream,
  // simulated with a fixed seed so it looks the same on every visit.
  function drawSettled() {
    if (!ready) return;
    particles = [];
    let seed = 7;
    rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const dt = 1 / 30;
    for (let s = 0; s < 150; s++) {
      const since = BREAK_GROW_S + s * dt;
      spawnFor(dt, frontAt(since), since);
      step(dt, s * dt);
    }
    rng = Math.random;
    paint(1, frontAt(BREAK_GROW_S), 1);
    drawParticles();
    particles = [];
  }

  function start() {
    if (!ready) return;
    if (reduced) { stop(); drawSettled(); return; }
    running = true;
    startT = performance.now(); lastT = 0;
    particles = []; emitAcc = 0; wordAcc = 0;
    if (!raf) raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }
  const resume = () => {
    if (running && visible && !document.hidden && !raf) { lastT = 0; raf = requestAnimationFrame(frame); }
  };

  // Pause off screen and in background tabs.
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; resume(); });
  io.observe(stage);
  const onVisibility = () => { visible = !document.hidden; resume(); };
  document.addEventListener('visibilitychange', onVisibility);
  let resizeT = 0;
  const ro = new ResizeObserver(() => {
    clearTimeout(resizeT);
    resizeT = window.setTimeout(() => { layout(); if (reduced) drawSettled(); }, 120);
  });
  ro.observe(stage);

  const onMotionPref = () => {
    reduced = mq.matches;
    root.classList.toggle('rr-anim', !reduced);
    clearTimers();
    cancelAnimationFrame(sweepRaf);
    if (reduced) { stop(); settleText(); drawSettled(); }
    else { playText(); start(); }
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
  img.onload = () => {
    layout();
    document.fonts.load(`16px ${FONT_STACK}`).finally(start);
  };
  img.src = cfg.portraitSrc;

  return () => {
    stop();
    clearTimers();
    cancelAnimationFrame(sweepRaf);
    clearTimeout(resizeT);
    io.disconnect();
    ro.disconnect();
    document.removeEventListener('visibilitychange', onVisibility);
    mq.removeEventListener('change', onMotionPref);
    keys.forEach((k) => k.removeEventListener('keydown', onKey));
    img.onload = null;
  };
}
