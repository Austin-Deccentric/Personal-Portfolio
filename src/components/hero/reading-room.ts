// Reading-room hero: key-by-key headline with a cursor-drawn strikethrough,
// and a 1-bit dithered portrait whose head breaks away into drifting text.
// mountReadingRoomHero() returns a cleanup function that stops every timer,
// animation frame and observer it started.

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
  /** Ink colour for the dither and drifting text, as [r, g, b]. */
  ink: [number, number, number];
  /** Dither pixel size in CSS px. */
  cell: number;
  words: string[];
}

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const FONT_STACK = '"Courier Prime", "Courier New", monospace';
const BAYER = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30,
  54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23,
  61, 29, 53, 21,
].map((v) => (v + 0.5) / 64);

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const hash = (i: number, s: number) => {
  let h = (i * 374761393 + s * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

type Kind = 'dash' | 'char' | 'word';
interface Particle {
  x: number; y: number; vx: number; vy: number;
  age: number; life: number; ph: number; kind: Kind;
  len?: number; s?: string; size?: number;
}

export function mountReadingRoomHero(root: HTMLElement, cfg: HeroConfig): () => void {
  const typedEl = root.querySelector<HTMLElement>('[data-typed]')!;
  const reveals = [...root.querySelectorAll<HTMLElement>('[data-reveal]')];
  const stage = root.querySelector<HTMLElement>('[data-stage]')!;
  const canvas = root.querySelector<HTMLCanvasElement>('[data-canvas]')!;
  const ctx = canvas.getContext('2d')!;
  const inkCss = `rgb(${cfg.ink.join(',')})`;
  const INK = new Uint32Array(new Uint8ClampedArray([...cfg.ink, 255]).buffer)[0];

  const mq = matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = mq.matches;
  root.classList.toggle('rr-anim', !reduced);

  // ---------- timers ----------
  const timers = new Set<number>();
  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => { timers.delete(id); fn(); }, ms);
    timers.add(id);
  };
  const clearTimers = () => { timers.forEach(clearTimeout); timers.clear(); };
  let sweepRaf = 0;

  // ---------- headline ----------
  let chars: { el: HTMLElement | null; seg: HeadlineSegment }[] = [];
  let strikeEl: HTMLElement | null = null;
  let strikeChars: HTMLElement[] = [];
  const cursor = document.createElement('span');
  cursor.className = 'rr-cursor';

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
          const c = document.createElement('span');
          c.className = 'rr-c';
          c.textContent = ch;
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

  const visibleChars = () => chars.filter((c) => c.el).map((c) => c.el!);
  function cursorAt(x: number, el: HTMLElement) {
    const b = typedEl.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    cursor.style.transform = `translate(${x - b.left}px, ${r.top - b.top + r.height * 0.17}px)`;
  }
  const after = (el: HTMLElement) => cursorAt(el.getBoundingClientRect().right + 3, el);
  const before = (el: HTMLElement) => cursorAt(el.getBoundingClientRect().left, el);

  function settleHeadline() {
    visibleChars().forEach((el) => el.classList.add('on'));
    strikeEl?.classList.add('struck');
    after(visibleChars().at(-1)!);
    cursor.classList.toggle('blink', !reduced);
    reveals.forEach((el) => el.classList.add('on'));
  }

  function playHeadline() {
    clearTimers();
    cancelAnimationFrame(sweepRaf);
    reveals.forEach((el) => el.classList.remove('on'));
    strikeEl?.classList.remove('struck');
    strikeEl?.style.setProperty('--p', '0');
    visibleChars().forEach((el) => el.classList.remove('on'));
    before(visibleChars()[0]);
    cursor.classList.add('blink');
    let i = 0;

    const step = () => {
      cursor.classList.remove('blink');
      while (i < chars.length && !chars[i].el) i++;
      if (i >= chars.length) return finish();
      const c = chars[i++];
      c.el!.classList.add('on');
      after(c.el!);
      const endOfStrike = c.seg.strike && (i >= chars.length || chars[i].seg !== c.seg);
      if (endOfStrike) return later(crossOut, 380);
      const next = chars[i];
      later(step, 44 + Math.random() * 48 + (next && !next.el ? 40 : 0));
    };

    // The cursor backs up over the word, then sweeps right and leaves the line behind it.
    const crossOut = () => {
      let k = strikeChars.length - 1;
      const back = () => {
        before(strikeChars[k]);
        if (--k >= 0) later(back, 70);
        else later(sweep, 240);
      };
      const sweep = () => {
        const first = strikeChars[0];
        const r0 = first.getBoundingClientRect();
        const r1 = strikeChars[strikeChars.length - 1].getBoundingClientRect();
        const t0 = performance.now();
        const run = (now: number) => {
          const p = Math.min(1, (now - t0) / 380);
          const e = 1 - Math.pow(1 - p, 3);
          strikeEl!.style.setProperty('--p', e.toFixed(3));
          cursorAt(r0.left + (r1.right + 3 - r0.left) * e, first);
          if (p < 1) sweepRaf = requestAnimationFrame(run);
          else { strikeEl!.classList.add('struck'); later(step, 300); }
        };
        sweepRaf = requestAnimationFrame(run);
      };
      back();
    };

    const finish = () => {
      cursor.classList.add('blink');
      reveals.forEach((el, k) => later(() => el.classList.add('on'), 120 + k * 140));
    };
    later(step, 700);
  }

  // ---------- portrait ----------
  const img = new Image();
  let gw = 0, gh = 0, cell = 3, dpr = 1, W = 0, H = 0, narrow = false;
  let tone = new Float32Array(0), bayerAt = new Float32Array(0), holes = new Float32Array(0), erodeW = new Float32Array(0);
  let small: HTMLCanvasElement | null = null, sctx: CanvasRenderingContext2D | null = null;
  let simg: ImageData | null = null, buf32 = new Uint32Array(0);
  let emitters: number[] = [], headCx = 0;
  let particles: Particle[] = [];
  let raf = 0, running = false, visible = true, startT = 0, lastT = 0, spawnAcc = 0, wordAcc = 0;
  let ready = false;

  function layout() {
    const r = stage.getBoundingClientRect();
    if (!r.width || !r.height || !img.naturalWidth) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.round(r.width * dpr); H = Math.round(r.height * dpr);
    canvas.width = W; canvas.height = H;
    cell = Math.max(2, Math.round(cfg.cell * dpr));
    gw = Math.ceil(W / cell); gh = Math.ceil(H / cell);
    narrow = window.innerWidth < 900;

    // Portrait sits on the floor, with headroom above for the stream.
    let scale = (gh * (narrow ? 0.92 : 0.84)) / img.naturalHeight;
    if (img.naturalWidth * scale > gw * 1.1) scale = (gw * 1.1) / img.naturalWidth;
    const dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
    const dx = (gw - dw) * (narrow ? 0.5 : 0.42), dy = gh - dh;

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
    const blurred = boxBlur(dark, gw, gh, 3);
    tone = new Float32Array(n); bayerAt = new Float32Array(n); erodeW = new Float32Array(n);
    let headTop = gh;
    for (let i = 0; i < n; i++) if (alpha[i] > 0.5) { headTop = (i / gw) | 0; break; }
    const band = gh * 0.2;
    let sx = 0, sc = 0;
    emitters = [];
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const i = y * gw + x;
      bayerAt[i] = BAYER[(y & 7) * 8 + (x & 7)];
      let v = Math.pow(dark[i], 1.15) * 1.05 + 1.5 * (dark[i] - blurred[i]); // tone + local detail
      v *= smooth(0.05, 0.3, alpha[i]);
      const xn = x / gw, yn = y / gh;
      let f = smooth(1.0, narrow ? 0.7 : 0.8, yn); // soft fade into the floor
      if (!narrow) f *= smooth(0.0, 0.14, xn);
      tone[i] = Math.max(0, Math.min(1, v * f));
      // Crown band: where the head breaks away, heavier toward the top and the right.
      const d = (y - headTop) / band;
      if (alpha[i] > 0.4 && d >= 0 && d < 1) {
        erodeW[i] = (1 - d) * (narrow ? 0.8 : 0.55 + 0.45 * xn);
        if (tone[i] > 0.15) { emitters.push(i); sx += x; sc++; }
      }
    }
    headCx = sc ? sx / sc : gw / 2;
    holes = new Float32Array(n);
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

  function paintDither(now: number, gain: number, erosion: number) {
    const n = gw * gh, seed = Math.floor(now / 90);
    for (let i = 0; i < n; i++) {
      let on = tone[i] * gain > bayerAt[i] && holes[i] < now;
      if (on && erosion > 0 && erodeW[i] > 0 && hash(i, seed) < erodeW[i] * erosion) on = false;
      buf32[i] = on ? INK : 0;
    }
    sctx!.putImageData(simg!, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small!, 0, 0, gw * cell, gh * cell);
  }

  function spawn(now: number, kind: Kind, rnd: () => number = Math.random) {
    if (!emitters.length) return;
    const idx = emitters[Math.floor(Math.pow(rnd(), 1.6) * emitters.length)];
    const gx = idx % gw, gy = (idx / gw) | 0;
    holes[idx] = now + 300 + rnd() * 1200;
    const spread = (gx - headCx) / Math.max(1, gw * 0.3);
    const wind = narrow ? 0 : 34; // the stream leans up and to the right
    const d = dpr;
    const p: Particle = { x: gx * cell, y: gy * cell, vx: 0, vy: 0, age: 0, life: 1, ph: rnd() * 6.28, kind };
    if (kind === 'dash') {
      p.vx = (wind + spread * 30 + (rnd() - 0.5) * 30) * d;
      p.vy = -(30 + rnd() * 60) * d;
      p.life = 1.6 + rnd() * 2.6;
      p.len = (4 + rnd() * 9) * d;
    } else if (kind === 'char') {
      p.vx = (wind * 0.8 + spread * 24 + (rnd() - 0.5) * 26) * d;
      p.vy = -(22 + rnd() * 40) * d;
      p.life = 2.4 + rnd() * 3;
      p.s = LETTERS[Math.floor(rnd() * LETTERS.length)];
      p.size = (11 + rnd() * 6) * d;
    } else {
      p.vx = (wind * 0.5 + spread * 14 + (rnd() - 0.5) * 10) * d;
      p.vy = -(14 + rnd() * 12) * d;
      p.life = 5 + rnd() * 2.5;
      p.s = cfg.words[Math.floor(rnd() * cfg.words.length)];
      p.size = (12 + rnd() * 2) * d;
    }
    particles.push(p);
  }

  function drawParticles(dt: number) {
    const maxP = narrow ? 170 : 340;
    if (particles.length > maxP) particles.splice(0, particles.length - maxP);
    ctx.fillStyle = inkCss;
    ctx.strokeStyle = inkCss;
    ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(1, Math.round(1.4 * dpr));
    ctx.lineCap = 'butt';
    const buckets: Particle[][] = [[], [], [], []]; // dashes, batched by opacity
    let font = '';
    for (let k = particles.length - 1; k >= 0; k--) {
      const p = particles[k];
      p.age += dt;
      if (p.age > p.life || p.y < -30 || p.x > W + 60) { particles.splice(k, 1); continue; }
      p.vy -= 6 * dpr * dt;
      p.x += (p.vx + Math.sin(p.age * 2.2 + p.ph) * 9 * dpr) * dt;
      p.y += p.vy * dt;
      const t = p.age / p.life;
      const a = Math.min(1, p.age / 0.2) * (1 - t * t) * smooth(0, H * 0.1, p.y);
      if (a <= 0.03) continue;
      if (p.kind === 'dash') { buckets[Math.min(3, (a * 4) | 0)].push(p); continue; }
      const f = p.kind === 'word'
        ? `italic 400 ${Math.round(p.size!)}px ${FONT_STACK}`
        : `700 ${Math.round(p.size!)}px ${FONT_STACK}`;
      if (f !== font) { ctx.font = f; font = f; }
      ctx.globalAlpha = p.kind === 'word' ? a * 0.8 : a;
      // Letters snap to the dither grid so they stay 1-bit crisp.
      const x = p.kind === 'word' ? Math.round(p.x) : Math.round(p.x / cell) * cell;
      const y = p.kind === 'word' ? Math.round(p.y) : Math.round(p.y / cell) * cell;
      ctx.fillText(p.s!, x, y);
    }
    for (let b = 0; b < 4; b++) {
      if (!buckets[b].length) continue;
      ctx.globalAlpha = (b + 1) / 4;
      ctx.beginPath();
      for (const p of buckets[b]) {
        const sp = Math.hypot(p.vx, p.vy) || 1;
        const x = Math.round(p.x / cell) * cell, y = Math.round(p.y / cell) * cell;
        ctx.moveTo(x, y);
        ctx.lineTo(x - (p.vx / sp) * p.len!, y - (p.vy / sp) * p.len!);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function frame(ts: number) {
    raf = 0;
    if (!running || !visible) return;
    const dt = Math.min(0.05, (ts - (lastT || ts)) / 1000);
    lastT = ts;
    const el = (ts - startT) / 1000;
    const ramp = smooth(1.0, 4.5, el); // the breakaway builds, then holds
    paintDither(ts, smooth(0, 1.6, el), ramp * 0.45);
    if (el > 1.0) {
      spawnAcc += dt * (narrow ? 50 : 110) * ramp;
      while (spawnAcc >= 1) { spawn(ts, Math.random() < 0.72 ? 'dash' : 'char'); spawnAcc--; }
      wordAcc += dt * 1.2 * ramp;
      while (wordAcc >= 1) { spawn(ts, 'word'); wordAcc--; }
    }
    drawParticles(dt);
    raf = requestAnimationFrame(frame);
  }

  // Still frame for reduced motion: full portrait, crown partly broken, a frozen stream.
  function drawSettled() {
    if (!ready) return;
    particles = [];
    holes.fill(0);
    let seed = 11;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let k = 0; k < 140; k++) {
      spawn(0, k % 35 === 0 ? 'word' : k % 3 === 0 ? 'char' : 'dash', rnd);
      const p = particles.at(-1);
      if (p) {
        p.age = rnd() * p.life * 0.75;
        p.x += p.vx * p.age;
        p.y += p.vy * p.age - 3 * dpr * p.age * p.age;
      }
    }
    holes.fill(0);
    paintDither(1e9, 1, 0.35);
    drawParticles(0);
    particles = [];
  }

  function start() {
    if (!ready) return;
    if (reduced) { stop(); drawSettled(); return; }
    running = true;
    startT = performance.now(); lastT = 0;
    particles = []; spawnAcc = 0; wordAcc = 0;
    holes.fill(0);
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
    if (reduced) { stop(); settleHeadline(); drawSettled(); }
    else { playHeadline(); start(); }
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
  root.classList.remove('rr-pending');
  document.fonts.ready.then(() => (reduced ? settleHeadline() : playHeadline()));
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
