const $ = s => document.querySelector(s);
const data = await fetch('data/projects.json', { cache: 'no-cache' }).then(r => r.json());
const P = data.projects;
const FLOW = P.flatMap((p, pi) => p.images.map((im, k) => ({ p, pi, k, ...im })));
const hi = () => innerWidth * (devicePixelRatio || 1) > 1500;
const src = (slug, f, size) => `media/${size || (hi() ? 'web' : 'md')}/${slug}/${f}.webp`;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const touch = matchMedia('(hover: none)').matches;
const mobile = () => innerWidth < 760;

const stage = $('.stage'), bg = $('.bg'), fg = $('.fg'), cursor = $('.cursor');
const ptitle = $('.ptitle');
const layers = { credits: $('.credits'), info: $('.info') };

// warm the cache so cuts are instant
FLOW.forEach(it => { new Image().src = src(it.p.slug, it.f, 'md'); });

/* ---------- place one image, never cropped ---------- */
const UI = 44;
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
  const token = ++placeToken, url = src(it.p.slug, it.f, size), bgUrl = src(it.p.slug, it.f, 'md');
  const apply = () => {
    if (token !== placeToken) return;
    fg.src = url; fg.alt = it.p.title;
    Object.assign(fg.style, { width: w + 'px', height: h + 'px', left: left + 'px', top: top + 'px' });
    stage.classList.toggle('frame', mode === 'frame');
    document.body.classList.toggle('dark', mode === 'frame');
    if (mode === 'frame') bg.src = bgUrl;
    if (m) fitNames(top, h, vh); else names.forEach(n => n.classList.remove('off'));
    tone();
  };
  ready(url).then(() => mode === 'frame' ? ready(bgUrl) : 0).then(apply, apply);
}
let placeToken = 0;
const cache = new Map();
function ready(url) {
  if (!cache.has(url)) { const im = new Image(); im.src = url; cache.set(url, (im.decode ? im.decode() : new Promise(r => im.onload = r)).catch(() => {})); }
  return cache.get(url);
}

/* phone: each name line sits in the free band above / below the photo; no room = no line */
const names = [...document.querySelectorAll('.bigname')];
function fitNames(top, h, vh) {
  const bands = [[UI - 4, top], [top + h, vh - UI + 4]];
  bands.forEach(([a, b], k) => {
    const n = names[k], band = b - a, f = Math.min(vh * .13, band * .92);
    n.classList.toggle('off', f < 46);
    n.style.setProperty(k ? '--t2' : '--t1', (a + (band - f) / 2) + 'px');
    n.style.setProperty(k ? '--f2' : '--f1', f + 'px');
  });
}

/* ---------- a short flicker of real frames, then land ---------- */
let g = -1, lastPi = -1, flickT = null;
/* intro: one cover per project at an even rhythm, same size, name changing with it */
function intro(done) {
  clearTimeout(flickT);
  const covers = P.map((p, pi) => ({ ...FLOW.find(x => x.pi === pi), m: 'full' }));
  covers.forEach(c => ready(src(c.p.slug, c.f)));
  let i = 0;
  const tick = () => {
    if (i >= covers.length) return done();
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
  else { clearTimeout(flickT); land(); }
  lastPi = it.pi;
}
function preload(i) { [i + 1, i - 1, i + 2].forEach(j => { const n = FLOW[(j + FLOW.length) % FLOW.length]; ready(src(n.p.slug, n.f)); if (n.m === 'frame') ready(src(n.p.slug, n.f, 'md')); }); }
const hashFor = i => i === 0 ? '#/' : `#/${FLOW[i].p.slug}/${FLOW[i].k + 1}`;
function go(i) { i = (i + FLOW.length) % FLOW.length; history.replaceState(null, '', hashFor(i)); show(i); }
const step = d => go(g + d);
addEventListener('resize', () => { if (g >= 0) place(FLOW[g]); });

/* project name bottom-left: a label only */
function setTitle(p) { ptitle.textContent = p.title; }

/* ---------- cursor: Prev / Next ---------- */
let mx = -1, my = -1;
function tone() { const r = fg.getBoundingClientRect(); cursor.classList.toggle('light', document.body.classList.contains('dark') || (mx > r.left && mx < r.right && my > r.top && my < r.bottom)); }
addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; cursor.style.transform = `translate(${mx}px,${my}px) translate(-50%,-60%)`; tone(); });
document.querySelectorAll('.zones i').forEach(z => {
  z.addEventListener('mouseenter', () => { cursor.textContent = z.dataset.a === 'prev' ? 'Prev' : 'Next'; cursor.classList.toggle('on', !touch); });
  z.addEventListener('click', () => step(z.dataset.a === 'prev' ? -1 : 1));
});
$('.zones').addEventListener('mouseleave', () => cursor.classList.remove('on'));

let tx = null;
addEventListener('touchstart', e => { tx = openLayer() ? null : e.touches[0].clientX; }, { passive: true });
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
$('[data-go="credits"]').addEventListener('click', () => { location.hash = '#/credits'; });

function renderCredits() {
  const cur = FLOW[Math.max(g, 0)], p = cur.p;
  layers.credits.innerHTML = `<a class="home" href="#/">${esc(data.name)}</a><button class="close">Close</button>
    <div class="strip">${p.images.map((im, k) => `<img src="${src(p.slug, im.f, 'md')}" data-k="${k}" alt="${esc(p.title)}">`).join('')}</div>
    <div class="meta"><h2>${esc(p.title)}</h2><dl>${p.credits.map(c => `<dt>${esc(c.role)}</dt><dd>${esc(c.name)}</dd>`).join('')}
      ${p.client ? `<dt>Client</dt><dd>${esc(p.client)}</dd>` : ''}${p.year ? `<dt>Year</dt><dd>${esc(p.year)}</dd>` : ''}</dl></div>`;
  layers.credits.querySelector('.close').onclick = close;
  layers.credits.querySelectorAll('.strip img').forEach(img => img.onclick = () => {
    const i = FLOW.findIndex(x => x.pi === cur.pi && x.k === +img.dataset.k); g = i; lastPi = cur.pi; location.hash = hashFor(i);
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
  if (i !== g || fg.getAttribute('src') == null) show(i); else { place(FLOW[i]); setTitle(FLOW[i].p); }
}
addEventListener('hashchange', route);
route();
