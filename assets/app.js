const $ = s => document.querySelector(s);
const data = await fetch('data/projects.json', { cache: 'no-cache' }).then(r => r.json());
const P = data.projects;
const FLOW = P.flatMap((p, pi) => p.images.map((im, k) => ({ p, pi, k, ...im })));
const hi = () => innerWidth * (devicePixelRatio || 1) > 1500;
const src = (slug, f, size) => `media/${size || (hi() ? 'web' : 'md')}/${slug}/${f}.webp`;
const vsrc = f => `media/video/${f}.mp4`, vposter = f => `media/video/${f}.jpg`;
const thumb = (p, im) => im.v ? vposter(im.f) : src(p.slug, im.f, 'md');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const touch = matchMedia('(hover: none)').matches;
const mobile = () => innerWidth < 760;
const hash = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

const stage = $('.stage'), bg = $('.bg'), fg = $('.fg'), fgv = $('.fgv'), cursor = $('.cursor');
const ptitle = $('.ptitle'), bigname = $('.bigname');
const layers = { credits: $('.credits'), info: $('.info') };

// warm the cache so cuts are instant
FLOW.forEach(it => { new Image().src = it.v ? vposter(it.f) : src(it.p.slug, it.f, 'md'); });

/* ---------- place one image or video, never cropped ---------- */
const UI = 44;
let placeToken = 0;
const cache = new Map();
function ready(url) {
  if (!cache.has(url)) { const im = new Image(); im.src = url; cache.set(url, (im.decode ? im.decode() : new Promise(r => im.onload = r)).catch(() => {})); }
  return cache.get(url);
}
function place(it, size) {
  const vw = innerWidth, vh = innerHeight, r = it.w / it.h, m = mobile();
  let mode = it.m, s = it.s || 1, cx = (it.x ?? 50) / 100, cy = (it.y ?? 50) / 100;
  if (m && mode !== 'full') { s = Math.min(1, s * 1.25); cx = .5; cy = .5; }
  const availH = vh - UI * 2;
  let maxW, maxH;
  if (mode === 'full') { maxW = vw - (m ? 0 : 40); maxH = availH; }
  else { maxH = availH * s; maxW = (vw - 40) * (m ? .9 : (mode === 'frame' ? .9 : .8)); }
  let h = maxH, w = h * r;
  if (w > maxW) { w = maxW; h = w / r; }
  let left = vw * cx - w / 2, top = vh * cy - h / 2;
  left = Math.min(Math.max(left, m ? 0 : 20), vw - w - (m ? 0 : 20));
  top = Math.min(Math.max(top, UI), vh - h - UI);
  // load first, then swap file + size in the same frame (no stretched old image in a new box)
  const token = ++placeToken;
  const url = it.v ? vposter(it.f) : src(it.p.slug, it.f, size);
  const bgUrl = it.v ? vposter(it.f) : src(it.p.slug, it.f, 'md');
  const box = { width: w + 'px', height: h + 'px', left: left + 'px', top: top + 'px' };
  const apply = () => {
    if (token !== placeToken) return;
    if (it.v) {
      const want = new URL(vsrc(it.f), location.href).href;
      if (fgv.src !== want) { fgv.poster = url; fgv.src = want; }
      Object.assign(fgv.style, box);
      fgv.play?.().catch(() => {});
    } else {
      fgv.pause?.();
      fg.src = url; fg.alt = it.p.title;
      Object.assign(fg.style, box);
    }
    stage.classList.toggle('isvid', !!it.v);
    stage.classList.toggle('frame', mode === 'frame');
    document.body.classList.toggle('dark', mode === 'frame');
    if (mode === 'frame') bg.src = bgUrl;
    setName(it, top, h, vw, vh, m);
    tone();
  };
  ready(url).then(() => mode === 'frame' ? ready(bgUrl) : 0).then(apply, apply);
}

/* ---------- her name: still, on about one slide in three, a different slice each time ---------- */
function nameOn(it) { return it.n ?? (hash(it.f + 'n') % 3 === 0); }
function setName(it, top, h, vw, vh, m) {
  const show = !intro.running && nameOn(it);
  bigname.classList.toggle('on', show);
  if (!show) return;
  const H = hash(it.f);
  if (!m) {
    bigname.style.setProperty('--nx', -(H % 3333) / 100 + '%');          // slide the endless line
    const f = vh * .38, c = .5 + (((H >>> 8) % 100) / 100 - .5) * .36;    // near the middle, sometimes higher / lower
    const y = Math.min(Math.max(c * vh - f / 2, UI + 6), vh - UI - 6 - f);
    bigname.style.setProperty('--nf', f + 'px'); bigname.style.setProperty('--ny', y + 'px');
  } else {
    // phone: once, in the bigger free band, tucked against the picture so it sits near the centre
    const above = top - UI, below = vh - UI - (top + h);
    const band = Math.max(above, below), f = Math.min(vh * .13, band * 1.2);
    if (f < 46) return bigname.classList.remove('on');
    const tuck = f * .28;
    const y = above >= below ? Math.max(UI, top - f + tuck) : Math.min(top + h - tuck, vh - UI - f);
    bigname.style.setProperty('--nf', f + 'px'); bigname.style.setProperty('--ny', y + 'px');
    // centre the middle copy of the name on screen, with a small nudge per slide
    const sp = bigname.querySelectorAll('span'), sw = sp[0].offsetWidth, tw = sw - f * .35;
    const j = (((H >>> 4) % 100) / 100 - .5) * vw * .16;
    bigname.style.setProperty('--nx', (vw / 2 + j - (sw + tw / 2)) + 'px');
  }
}

/* ---------- intro: one cover per project at an even rhythm ---------- */
let g = -1, lastPi = -1, flickT = null;
function intro(done) {
  clearTimeout(flickT);
  const covers = P.map((p, pi) => ({ ...FLOW.find(x => x.pi === pi && !x.v), m: 'full' }));
  covers.forEach(c => ready(src(c.p.slug, c.f)));
  intro.running = true;
  let i = 0;
  const tick = () => {
    if (i >= covers.length) { intro.running = false; return done(); }
    const c = covers[i++]; place(c); ptitle.textContent = c.p.title;
    flickT = setTimeout(tick, 170);
  };
  tick();
}

function show(i) {
  i = (i + FLOW.length) % FLOW.length;
  const it = FLOW[i];
  const land = () => { place(it); setTitle(it.p); preload(i); };
  const first = g < 0;
  g = i;
  if (first && i === 0) intro(land);
  else { clearTimeout(flickT); intro.running = false; land(); }
  lastPi = it.pi;
}
function preload(i) {
  [i + 1, i - 1, i + 2].forEach(j => {
    const n = FLOW[(j + FLOW.length) % FLOW.length];
    if (n.v) { ready(vposter(n.f)); const v = document.createElement('link'); v.rel = 'preload'; v.as = 'video'; v.href = vsrc(n.f); document.head.appendChild(v); return; }
    ready(src(n.p.slug, n.f)); if (n.m === 'frame') ready(src(n.p.slug, n.f, 'md'));
  });
}
const hashFor = i => i === 0 ? '#/' : `#/${FLOW[i].p.slug}/${FLOW[i].k + 1}`;
function go(i) { i = (i + FLOW.length) % FLOW.length; history.replaceState(null, '', hashFor(i)); show(i); }
const step = d => go(g + d);
addEventListener('resize', () => { if (g >= 0) place(FLOW[g]); });

/* project name bottom-left opens that shoot's credits */
function setTitle(p) { ptitle.textContent = p.title; }

/* ---------- cursor: Prev / Next ---------- */
let mx = -1, my = -1;
function tone() {
  const r = (stage.classList.contains('isvid') ? fgv : fg).getBoundingClientRect();
  cursor.classList.toggle('light', document.body.classList.contains('dark') || (mx > r.left && mx < r.right && my > r.top && my < r.bottom));
}
addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; cursor.style.transform = `translate(${mx}px,${my}px) translate(-50%,-60%)`; tone(); });
document.querySelectorAll('.zones i').forEach(z => {
  z.addEventListener('mouseenter', () => { cursor.textContent = z.dataset.a === 'prev' ? 'Prev' : 'Next'; cursor.classList.toggle('on', !touch); });
  z.addEventListener('click', () => step(z.dataset.a === 'prev' ? -1 : 1));
});
$('.zones').addEventListener('mouseleave', () => cursor.classList.remove('on'));

let tx = null;
addEventListener('touchstart', e => { tx = openLayer() || e.target.closest('.looks') ? null : e.touches[0].clientX; }, { passive: true });
addEventListener('touchend', e => { if (tx == null) return; const d = e.changedTouches[0].clientX - tx; if (Math.abs(d) > 45) step(d < 0 ? 1 : -1); tx = null; });
addEventListener('keydown', e => {
  if (e.target.closest('input,textarea')) return;
  if (e.key === 'Escape') return openLayer() && close();
  if (openLayer()) return;
  if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); step(1); }
  if (e.key === 'ArrowLeft') step(-1);
});

/* ---------- overlays ---------- */
const openLayer = () => Object.keys(layers).find(k => !layers[k].hidden);
const close = () => { location.hash = hashFor(Math.max(g, 0)); };
document.querySelectorAll('[data-go="credits"]').forEach(b => b.addEventListener('click', () => { location.hash = '#/credits'; }));

function renderCredits() {
  const cur = FLOW[Math.max(g, 0)], p = cur.p;
  layers.credits.innerHTML = `<a class="home" href="#/">${esc(data.name)}</a><button class="close">Close</button>
    <div class="strip">${p.images.map((im, k) => im.v
      ? `<video src="${vsrc(im.f)}" poster="${vposter(im.f)}" data-k="${k}" muted loop playsinline autoplay></video>`
      : `<img src="${thumb(p, im)}" data-k="${k}" alt="${esc(p.title)}">`).join('')}</div>
    <div class="meta"><h2>${esc(p.title)}</h2><dl>${p.credits.map(c => `<dt>${esc(c.role)}</dt><dd>${esc(c.name)}</dd>`).join('')}
      ${p.client ? `<dt>Client</dt><dd>${esc(p.client)}</dd>` : ''}${p.year ? `<dt>Year</dt><dd>${esc(p.year)}</dd>` : ''}</dl></div>`;
  layers.credits.querySelector('.close').onclick = close;
  layers.credits.querySelectorAll('.strip [data-k]').forEach(el => el.onclick = () => {
    const i = FLOW.findIndex(x => x.pi === cur.pi && x.k === +el.dataset.k); g = i; lastPi = cur.pi; location.hash = hashFor(i);
  });
  const strip = layers.credits.querySelector('.strip');
  strip.addEventListener('wheel', e => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { strip.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
}

function renderInfo() {
  const L = layers.info;
  L.innerHTML = `<a class="home" href="#/">${esc(data.name)}</a><button class="close">Close</button>
    <div><p class="bio">${esc(data.bio)}</p>
      <div class="links">${data.instagram ? `<a href="https://instagram.com/${esc(data.instagram)}" target="_blank" rel="noopener">Instagram</a>` : '<span>Instagram</span>'}</div></div>
    <div><form class="contact" novalidate>
      <input name="name" placeholder="Name" aria-label="Name" required autocomplete="name">
      <input name="email" type="email" placeholder="Email" aria-label="Email" required autocomplete="email">
      <textarea name="message" placeholder="Message" aria-label="Message" required></textarea>
      <div class="row"><button class="send" type="submit">Send</button><span class="note"></span></div></form>
      <form class="news" novalidate><input name="email" type="email" placeholder="Newsletter — your email" aria-label="Newsletter email" required><button type="submit">Join</button></form></div>`;
  L.querySelector('.close').onclick = close;
  const c = L.querySelector('.contact'), note = c.querySelector('.note');
  c.addEventListener('submit', async e => {
    e.preventDefault(); if (!c.checkValidity()) { note.textContent = 'Please fill in every field.'; return; }
    note.textContent = 'Sending…';
    try { const r = await fetch('/api/contact', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(c))) });
      if (!r.ok) throw 0; c.reset(); note.textContent = 'Thank you.'; }
    catch { note.textContent = 'Thank you. (Preview — goes live at launch.)'; }
  });
  const nf = L.querySelector('.news');
  nf.addEventListener('submit', async e => { e.preventDefault(); if (!nf.checkValidity()) return;
    try { await fetch('/api/subscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(nf))) }); } catch {}
    nf.innerHTML = '<p class="note">Thank you.</p>'; });
}

/* ---------- looks: type + colour, previewable with ?preview ---------- */
const LOOKS = { type: ['classic', 'august', 'climax'], colour: ['mono', 'pink'] };
const qs = new URLSearchParams(location.search);
const store = { get: k => { try { return localStorage.getItem('lm-' + k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem('lm-' + k, v); } catch {} } };
const look = { type: qs.get('type') || store.get('type') || data.look?.type || 'classic', colour: qs.get('colour') || store.get('colour') || data.look?.colour || 'mono' };
let looksLabel = () => {};
function applyLook() {
  looksLabel();
  document.documentElement.dataset.type = look.type;
  document.documentElement.dataset.colour = look.colour;
  document.querySelectorAll('.looks button').forEach(b => b.classList.toggle('on', look[b.dataset.k] === b.dataset.v));
  blink();
  if (g >= 0) place(FLOW[g]);
}
if (qs.has('preview')) {
  // collapsed to one small line ("Look: Classic · Mono"); opens upward on click, closes when you pick or click away
  const L = $('.looks'), name = v => v[0].toUpperCase() + v.slice(1);
  L.innerHTML = `<div class="opts" hidden>${Object.entries(LOOKS).map(([k, vs]) => `<div><span>${k === 'type' ? 'Type' : 'Colour'}</span>` + vs.map(v => `<button data-k="${k}" data-v="${v}">${name(v)}</button>`).join('') + '</div>').join('')}</div><button class="cur"></button>`;
  const opts = L.querySelector('.opts'), cur = L.querySelector('.cur');
  looksLabel = () => { cur.textContent = `Look: ${name(look.type)} · ${name(look.colour)}`; };
  L.hidden = false;
  L.addEventListener('click', e => {
    e.stopPropagation();
    const b = e.target.closest('button'); if (!b) return;
    if (b === cur) { opts.hidden = !opts.hidden; return; }
    look[b.dataset.k] = b.dataset.v; store.set(b.dataset.k, b.dataset.v);
    const q = new URLSearchParams(location.search); q.set(b.dataset.k, b.dataset.v);
    history.replaceState(null, '', '?' + q.toString().replace(/=(&|$)/g, '$1') + location.hash);
    applyLook();
  });
  addEventListener('click', () => { opts.hidden = true; });
}
/* pink: the small type switches colour (and now and then to italic), like CLIMAX's header */
let blinkT = null;
function blink() {
  clearInterval(blinkT);
  const els = [...document.querySelectorAll('.ui .home, .ui .ptitle')];
  els.forEach(e => e.classList.remove('blink', 'it'));
  if (look.colour !== 'pink' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let n = 0;
  blinkT = setInterval(() => { n++; els.forEach((e, k) => { e.classList.toggle('blink', (n + k) % 2 === 0); e.classList.toggle('it', (n + k) % 4 === 0); }); }, 650);
}

/* ---------- router ---------- */
function route() {
  const [a, b] = location.hash.replace(/^#\/?/, '').split('/');
  Object.values(layers).forEach(l => l.hidden = true);
  if (layers[a]) {
    if (g < 0) { g = 0; lastPi = 0; place(FLOW[0]); setTitle(FLOW[0].p); }
    ({ info: renderInfo, credits: renderCredits })[a]();
    layers[a].hidden = false; cursor.classList.remove('on');
    return;
  }
  const pi = P.findIndex(p => p.slug === a);
  const i = pi < 0 ? 0 : FLOW.findIndex(x => x.pi === pi && x.k === Math.min(Math.max((+b || 1) - 1, 0), P[pi].images.length - 1));
  if (i !== g || (!fg.getAttribute('src') && !fgv.getAttribute('src'))) show(i); else { place(FLOW[i]); setTitle(FLOW[i].p); }
}
addEventListener('hashchange', route);
applyLook();
route();
