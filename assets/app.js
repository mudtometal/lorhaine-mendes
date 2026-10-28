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
const ptitle = $('.ptitle'), plist = $('.plist');
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
  fg.src = src(it.p.slug, it.f, size);
  fg.alt = it.p.title;
  Object.assign(fg.style, { width: w + 'px', height: h + 'px', left: left + 'px', top: top + 'px' });
  stage.classList.toggle('frame', mode === 'frame');
  if (mode === 'frame') bg.src = src(it.p.slug, it.f, 'md');
}

/* ---------- a short flicker of real frames, then land ---------- */
let g = -1, lastPi = -1, flickT = null;
/* intro: one cover per project at an even rhythm, same size, name changing with it */
function intro(done) {
  clearTimeout(flickT);
  const covers = P.map((p, pi) => ({ ...FLOW.find(x => x.pi === pi), m: 'full' }));
  let i = 0;
  const tick = () => {
    if (i >= covers.length) return done();
    const c = covers[i++]; place(c, 'md'); ptitle.textContent = c.p.title;
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
function preload(i) { [i + 1, i - 1].forEach(j => { const n = FLOW[(j + FLOW.length) % FLOW.length]; new Image().src = src(n.p.slug, n.f); }); }
const hashFor = i => i === 0 ? '#/' : `#/${FLOW[i].p.slug}/${FLOW[i].k + 1}`;
function go(i) { i = (i + FLOW.length) % FLOW.length; history.replaceState(null, '', hashFor(i)); show(i); }
const step = d => go(g + d);
addEventListener('resize', () => { if (g >= 0) place(FLOW[g]); });

/* ---------- project picker (replaces the index page) ---------- */
plist.innerHTML = P.map((p, i) => `<li><button data-i="${i}">${esc(p.title)}</button></li>`).join('');
function setTitle(p) { ptitle.textContent = p.title; plist.querySelectorAll('button').forEach(b => b.classList.toggle('on', P[b.dataset.i] === p)); }
ptitle.addEventListener('click', () => { plist.hidden = !plist.hidden; });
plist.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; plist.hidden = true; go(FLOW.findIndex(x => x.pi === +b.dataset.i)); });

/* ---------- cursor: Prev / Next ---------- */
addEventListener('mousemove', e => { cursor.style.transform = `translate(${e.clientX}px,${e.clientY}px) translate(-50%,-60%)`; });
document.querySelectorAll('.zones i').forEach(z => {
  z.addEventListener('mouseenter', () => { cursor.textContent = z.dataset.a === 'prev' ? 'Prev' : 'Next'; cursor.classList.toggle('on', !touch); });
  z.addEventListener('click', () => { plist.hidden = true; step(z.dataset.a === 'prev' ? -1 : 1); });
});
$('.zones').addEventListener('mouseleave', () => cursor.classList.remove('on'));

let tx = null;
addEventListener('touchstart', e => { tx = openLayer() ? null : e.touches[0].clientX; }, { passive: true });
addEventListener('touchend', e => { if (tx == null) return; const d = e.changedTouches[0].clientX - tx; if (Math.abs(d) > 45) step(d < 0 ? 1 : -1); tx = null; });
addEventListener('keydown', e => {
  if (e.target.closest('input,textarea')) return;
  if (e.key === 'Escape') return openLayer() ? close() : (plist.hidden = true);
  if (openLayer()) return;
  if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); step(1); }
  if (e.key === 'ArrowLeft') step(-1);
});

/* ---------- overlays ---------- */
const openLayer = () => Object.keys(layers).find(k => !layers[k].hidden);
const close = () => { location.hash = hashFor(Math.max(g, 0)); };
$('[data-go="credits"]').addEventListener('click', () => { plist.hidden = true; location.hash = '#/credits'; });

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
      <label>Name<input name="name" required autocomplete="name"></label>
      <label>Email<input name="email" type="email" required autocomplete="email"></label>
      <label>Message<textarea name="message" required></textarea></label>
      <div class="row"><button class="send" type="submit">Send</button><span class="note"></span></div></form>
      <form class="news" novalidate><label>Newsletter<input name="email" type="email" required></label><button type="submit">Join</button></form></div>`;
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
